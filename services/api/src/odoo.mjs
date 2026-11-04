// Odoo integration: Help Desk tickets and Daily Tasks for the Info Hub.
// Data is read through Odoo's external JSON-RPC API (/jsonrpc) with a user
// login and API key. Nothing reads the Odoo database directly.
import {z} from 'zod';
import {one} from './db.mjs';
import {check,Problem,profileTypes} from './domain.mjs';

export const odooPages={helpdesk:'info-helpdesk',tasks:'info-tasks'};
const pageKinds=Object.fromEntries(Object.entries(odooPages).map(([k,v])=>[v,k]));
const serverZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const defaults={enabled:false,url:'',database:'',username:'',apiKey:'',timezone:'',taskScope:'deadline',helpdesk:true,tasks:true,profiles:['management']};
const CACHE_MS=60000;

const validZone=tz=>{try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return true}catch{return false}};
export function odooUrl(value){
 const v=String(value||'').trim();if(!v)return '';
 let url;try{url=new URL(v)}catch{check(false,422,'Enter the full Odoo address, for example https://odoo.example.com')}
 check(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password,422,'Odoo address must be http(s) without credentials');
 const host=url.hostname.toLowerCase();
 check(!/^169\.254\./.test(host)&&host!=='metadata.google.internal',422,'Link-local and metadata addresses are not allowed');
 return url.origin+url.pathname.replace(/\/+$/,'');
}

export async function odooSettings(db){return {...defaults,...((await one(db,"SELECT value FROM settings WHERE key='odoo'"))?.value||{})}}
const apiKeyOf=s=>s.apiKey||process.env.ODOO_API_KEY||'';
export const odooConfigured=s=>Boolean(s.url&&s.database&&s.username&&apiKeyOf(s));
/** Settings safe to show in the admin: the API key is never returned. */
export function odooPublic(s){const {apiKey,...rest}=s;return {...rest,timezone:s.timezone||'',effectiveTimezone:s.timezone||serverZone(),apiKeyConfigured:Boolean(apiKeyOf(s)),apiKeyFromEnvironment:!s.apiKey&&Boolean(process.env.ODOO_API_KEY),configured:odooConfigured(s)}}
/** Help Desk and Daily Tasks pages are only published to the chosen profile types (none = all). */
export const odooPageAllowed=(s,profileType,page)=>!pageKinds[page]||((s.enabled||!odooConfigured(s))&&s[pageKinds[page]]!==false&&(!s.profiles?.length||s.profiles.includes(profileType)));

// Odoo stores datetimes in UTC as "YYYY-MM-DD HH:MM:SS"; "today" follows the configured time zone.
const odooTime=ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19);
function zoneOffset(ms,tz){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute,+p.second)-Math.floor(ms/1000)*1000;
}
const localMidnight=(y,m,d,tz)=>{const guess=Date.UTC(y,m-1,d);const first=guess-zoneOffset(guess,tz);return guess-zoneOffset(first,tz)};
export function dayRange(tz,now=Date.now()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const [y,m,d]=day.split('-').map(Number);
 return {day,start:odooTime(localMidnight(y,m,d,tz)),end:odooTime(localMidnight(y,m,d+1,tz))};
}

/** Minimal Odoo JSON-RPC client (works with Odoo 14 to 18). */
export function odooClient(s,{fetchImpl=fetch,timeoutMs=10000}={}){
 const endpoint=s.url.replace(/\/+$/,'')+'/jsonrpc',key=apiKeyOf(s);let uid,seq=0;
 async function rpc(service,method,args){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   let r;
   try{r=await fetchImpl(endpoint,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'call',params:{service,method,args},id:++seq})})}
   catch{throw new Problem(502,controller.signal.aborted?'Odoo did not respond within 10 seconds':'Could not reach the Odoo address')}
   if(!r.ok)throw new Problem(502,r.status===404?'No Odoo JSON-RPC endpoint at this address':`Odoo returned HTTP ${r.status}`);
   let body;try{body=await r.json()}catch{throw new Problem(502,'Odoo returned a response that is not JSON')}
   if(body.error){const msg=String(body.error.data?.message||body.error.message||'Odoo error').split('\n')[0].slice(0,300);throw Object.assign(new Problem(502,'Odoo: '+msg),{odoo:body.error.data?.name||''})}
   return body.result;
  }finally{clearTimeout(timer)}
 }
 return {
  async login(){if(!uid){uid=await rpc('common','authenticate',[s.database,s.username,key,{}]);if(!uid)throw new Problem(502,'Odoo rejected the user name or API key')}return uid},
  async call(model,method,args=[],kwargs={}){await this.login();return rpc('object','execute_kw',[s.database,uid,key,model,method,args,kwargs])},
 };
}

async function modelFields(client,model,app){
 try{return await client.call(model,'fields_get',[],{attributes:['type','selection','store']})}
 catch(e){if(/doesn't exist|does not exist|KeyError|not found/i.test(e.message))throw new Problem(502,`The ${app} app is not installed in this Odoo database`);throw e}
}

export async function helpdeskSnapshot(client,s,now=Date.now()){
 const fields=await modelFields(client,'helpdesk.ticket','Help Desk'),range=dayRange(s.timezone||serverZone(),now);
 const today=[['create_date','>=',range.start],['create_date','<',range.end]];
 // OCA helpdesk_mgmt has a stored "closed" flag; Odoo Enterprise Help Desk closes tickets in folded stages.
 const closed=fields.closed?.store!==false&&fields.closed?[['closed','=',true]]:[['stage_id.fold','=',true]];
 const [total,resolved]=await Promise.all([client.call('helpdesk.ticket','search_count',[today]),client.call('helpdesk.ticket','search_count',[[...today,...closed]])]);
 return {day:range.day,total,resolved,unresolved:Math.max(0,total-resolved)};
}

export async function taskSnapshot(client,s,now=Date.now(),limit=20){
 const fields=await modelFields(client,'project.task','Project'),range=dayRange(s.timezone||serverZone(),now);
 let done,exclude=[];
 if(fields.state?.selection?.some(([v])=>v==='1_done')){done=['state','=','1_done'];exclude=[['state','!=','1_canceled']]}
 else if(fields.is_closed&&fields.is_closed.store!==false)done=['is_closed','=',true];
 else done=['stage_id.fold','=',true];
 const byDate=f=>fields[f]?.type==='date'?[[f,'=',range.day]]:[[f,'>=',range.start],[f,'<',range.end]];
 const scope=s.taskScope==='created'?byDate('create_date'):byDate('date_deadline');
 const base=[...scope,...exclude];
 const [total,finished]=await Promise.all([client.call('project.task','search_count',[base]),client.call('project.task','search_count',[[...base,done]])]);
 const people=fields.user_ids?'user_ids':fields.user_id?'user_id':null;
 const wanted=['name','project_id','stage_id','date_deadline','priority',people].filter(f=>f&&fields[f]);
 const open=await client.call('project.task','search_read',[[...base,'!',done]],{fields:wanted,limit,order:'priority desc, date_deadline asc, id asc'});
 const ids=[...new Set(open.flatMap(t=>people==='user_ids'?t.user_ids||[]:t.user_id?[t.user_id[0]]:[]))];
 const names=people==='user_ids'&&ids.length?Object.fromEntries((await client.call('res.users','read',[ids],{fields:['name']})).map(u=>[u.id,u.name])):{};
 const items=open.map(t=>({id:t.id,name:String(t.name||''),project:t.project_id?t.project_id[1]:'',assignees:people==='user_ids'?(t.user_ids||[]).map(id=>names[id]).filter(Boolean):t.user_id?[t.user_id[1]]:[],deadline:t.date_deadline||'',stage:t.stage_id?t.stage_id[1]:'',priority:String(t.priority||'0')}));
 return {day:range.day,scope:s.taskScope,total,finished,unfinished:Math.max(0,total-finished),items};
}

const sample={
 helpdesk:()=>({availability:'simulated',total:24,resolved:17,unresolved:7}),
 tasks:()=>({availability:'simulated',total:12,finished:8,unfinished:4,items:[
  {id:1,name:'Prepare monthly operations report',project:'Management',assignees:['Operations team'],deadline:'',stage:'In Progress',priority:'1'},
  {id:2,name:'Review visitor feedback',project:'Customer Care',assignees:['Service desk'],deadline:'',stage:'New',priority:'0'},
  {id:3,name:'Approve training schedule',project:'Learning',assignees:['HR'],deadline:'',stage:'In Progress',priority:'0'},
  {id:4,name:'Update reception signage',project:'Facilities',assignees:['Facilities'],deadline:'',stage:'New',priority:'0'}]}),
};

export function createOdooService({db,demo=false,fetchImpl=(...a)=>fetch(...a),now=()=>Date.now()}){
 const cache=new Map(),status={};
 const load={helpdesk:helpdeskSnapshot,tasks:taskSnapshot};
 async function fresh(kind,s){
  const data=await load[kind](odooClient(s,{fetchImpl}),s,now());
  status[kind]={lastSuccessAt:new Date(now()).toISOString(),lastError:''};
  return data;
 }
 async function snapshot(kind,s){
  const signature=JSON.stringify(s),hit=cache.get(kind);
  if(hit?.signature===signature&&(hit.pending||now()-hit.at<CACHE_MS))return hit.pending||hit.value;
  const pending=fresh(kind,s).then(v=>{const value={...v,availability:'connected',updatedAt:new Date(now()).toISOString()};cache.set(kind,{signature,at:now(),value});return value},e=>{
   status[kind]={...status[kind],lastError:e.message,lastErrorAt:new Date(now()).toISOString()};
   const value=hit?.signature===signature&&hit.value?.total!==undefined?{...hit.value,availability:'stale',error:e.message}:{availability:'error',error:e.message};
   cache.set(kind,{signature,at:now(),value});return value});
  cache.set(kind,{...hit,signature,at:hit?.at||0,pending});
  return pending;
 }
 return {
  /** Operational data for a TV profile, cached for a minute per integration. */
  async operational(kind,profile){
   const s=await odooSettings(db);
   if(profile&&!odooPageAllowed(s,profile.profileType,odooPages[kind]))return null;
   if(!odooConfigured(s))return demo?sample[kind]():{availability:'unconnected'};
   if(!s.enabled||s[kind]===false)return {availability:'unconnected'};
   return snapshot(kind,s);
  },
  status:()=>structuredClone(status),
  clear(){cache.clear()},
  async test(){
   const s=await odooSettings(db);check(odooConfigured(s),422,'Enter the Odoo address, database, user and API key first');
   const client=odooClient(s,{fetchImpl}),uid=await client.login(),result={uid};
   for(const kind of ['helpdesk','tasks']){if(s[kind]===false){result[kind]={skipped:true};continue}try{result[kind]=await load[kind](client,s,now());status[kind]={lastSuccessAt:new Date(now()).toISOString(),lastError:''}}catch(e){result[kind]={error:e.message}}}
   cache.clear();return result;
  },
 };
}

const settingsSchema=z.object({
 enabled:z.boolean(),
 url:z.string().max(500),
 database:z.string().trim().max(120),
 username:z.string().trim().max(200),
 apiKey:z.string().max(500).optional(),
 clearApiKey:z.boolean().optional(),
 timezone:z.string().trim().max(60).default(''),
 taskScope:z.enum(['deadline','created']),
 helpdesk:z.boolean(),
 tasks:z.boolean(),
 profiles:z.array(z.enum(profileTypes)).max(profileTypes.length),
}).strict();

export function registerOdooRoutes(app,{db,admin,wrap,service,audit,releaseAll}){
 app.get('/api/admin/odoo',admin('viewer'),wrap(async(req,res)=>res.json({...odooPublic(await odooSettings(db)),status:service.status()})));
 app.put('/api/admin/odoo',admin('admin'),wrap(async(req,res)=>{
  const p=settingsSchema.parse(req.body),current=await odooSettings(db);
  check(!p.timezone||validZone(p.timezone),422,'Unknown time zone. Use a name such as Asia/Muscat');
  const {clearApiKey,apiKey,...rest}=p;
  const next={...rest,url:odooUrl(p.url),profiles:[...new Set(p.profiles)],apiKey:clearApiKey?'':apiKey?.trim()||current.apiKey||''};
  check(!next.enabled||odooConfigured(next),422,'Enter the Odoo address, database, user and API key before enabling the integration');
  await db.tx(async tx=>{
   await tx.query("INSERT INTO settings(key,value) VALUES('odoo',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(next)]);
   await audit(tx,req.user.email,'update-odoo','settings','odoo',{...rest,apiKeyChanged:Boolean(apiKey?.trim())||Boolean(clearApiKey)});
   // Help Desk / Daily Tasks pages follow the chosen profiles, so republish every profile.
   await releaseAll(tx,'Odoo integration settings changed');
  });
  service.clear();
  res.json(odooPublic(next));
 }));
 app.post('/api/admin/odoo/test',admin('admin'),wrap(async(req,res)=>res.json(await service.test())));
}
