import React,{useEffect,useState} from 'react';
import SourceImportPanel from '../components/SourceImportPanel';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,Cable,CalendarClock,FileImage,Headset,KeyRound,ListChecks,MonitorPlay,PlugZap,Rss,Save,Ticket,Upload} from 'lucide-react';
import {API,request} from '../api';
import {adminHash} from '../navigation';
import {PageHeading,Card,Status,useFeedback,Button,FormField,copyText} from '../components/Common';

type OdooSettings={enabled:boolean;url:string;database:string;username:string;timezone:string;effectiveTimezone:string;taskScope:'deadline'|'created';weekStart:'sunday'|'monday'|'saturday';helpdesk:boolean;tasks:boolean;profiles:string[];apiKeyConfigured:boolean;apiKeyFromEnvironment:boolean;configured:boolean;status?:Record<string,{lastSuccessAt?:string;lastError?:string}>};
type OdooForm=Omit<OdooSettings,'effectiveTimezone'|'apiKeyConfigured'|'apiKeyFromEnvironment'|'configured'|'status'>&{apiKey:string;clearApiKey:boolean};
type TestResult={uid:number;helpdesk?:any;tasks?:any};
type ConnectorId='spacehub'|'serveiq';
type ConnectorSettings={enabled:boolean;url:string;email?:string;branchId?:string;configured:boolean;passwordConfigured?:boolean;passwordFromEnvironment?:boolean;status?:{lastSuccessAt?:string;lastError?:string}};
const profiles=[['public','Public / Visitor'],['employee','Employee'],['management','Management'],['vip','VIP Lounge'],['signage','Dedicated Signage']];
const go=(id:string)=>{window.location.hash=adminHash(id)};

export default function Integrations({assets=false,role}:{assets?:boolean;role:string}){
 const {data,refetch}=useQuery({queryKey:[assets?'assets':'integrations'],queryFn:()=>request<any>(assets?'/api/admin/assets':'/api/admin/integrations')});const f=useFeedback();const [busy,setBusy]=useState(false);
 async function upload(file:File){setBusy(true);try{await API.uploadAsset(file);await refetch();f.success('Asset uploaded and verified')}catch(e){f.error(e)}finally{setBusy(false)}}
 if(assets)return <><PageHeading eyebrow="CONTENT WORKSPACE" title="Media assets" subtitle="Upload artwork, documents and media once. Reference them across your experiences."><label className="upload-button"><Upload size={16}/>{busy?'Uploading…':'Upload asset'}<input hidden type="file" disabled={busy||role==='viewer'} accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,audio/mpeg" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0])}}/></label></PageHeading><div className="asset-grid">{(data||[]).map((a:any)=><Card key={a.id}>{a.mime.startsWith('image/')?<img className="asset-thumb" src={'/api/assets/'+a.id} alt={a.name}/>:a.mime.startsWith('video/')?<video className="asset-thumb" src={'/api/assets/'+a.id} controls preload="metadata"/>:a.mime.startsWith('audio/')?<audio src={'/api/assets/'+a.id} controls preload="none" style={{width:'100%'}}/>:<div className="asset-thumb empty-art"><FileImage/></div>}<strong>{a.name}</strong><small className="block-muted">{a.mime} · {(Number(a.bytes)/1024/1024).toFixed(2)} MB</small><Button variant="secondary" onClick={()=>copyText('/api/assets/'+a.id).then(()=>f.success('Asset reference copied: /api/assets/'+a.id),f.error)}>Copy reference</Button></Card>)}</div>{!data?.length&&<Card><p>Upload your first asset to build the shared media library.</p></Card>}<div className="info-strip">Artwork: PNG, JPEG or WebP, up to 10 MB. Documents and media: PDF, MP4 or MP3, up to 100 MB.</div>{f.node}</>;
 const feed=(id:string)=>data?.feeds?.some((r:any)=>r.id===id)?'Connected':data?.demo?'Sample data':'Unconnected';
 const odoo=data?.odoo as OdooSettings|undefined;
 const spacehub=data?.spacehub as ConnectorSettings|undefined,serveiq=data?.serveiq as ConnectorSettings|undefined;
 // A live SpaceHub/ServeIQ connection takes priority over pushed snapshots.
 const liveState=(c?:ConnectorSettings)=>c?.enabled&&c.configured?(c.status?.lastError?'Error':'Connected'):null;
 const odooState=(kind:'helpdesk'|'tasks')=>!odoo?'Unconnected':!odoo.configured?(data?.demo?'Sample data':'Unconnected'):!odoo.enabled||!odoo[kind]?'Disabled':odoo.status?.[kind]?.lastError?'Error':'Connected';
 const news=data?.news;
 const cards=[
  {id:'meeting',title:'Meeting rooms',icon:CalendarClock,desc:'Room availability, meeting counts and upcoming schedules.',state:liveState(spacehub)||feed('meeting'),note:liveState(spacehub)?(spacehub?.status?.lastError||'Live from SpaceHub · refreshed every 15 seconds'):'Authenticated snapshot ingestion · 90-second stale threshold',link:['content:meetings','Meeting schedule']},
  {id:'queue',title:'Queue management (QMS)',icon:Ticket,desc:'Waiting, served, counter status and tickets being called.',state:liveState(serveiq)||feed('queue'),note:liveState(serveiq)?(serveiq?.status?.lastError||'Live from ServeIQ · refreshed every 15 seconds'):'Authenticated snapshot ingestion · 90-second stale threshold',link:['content:queueTickets','Queue tickets']},
  {id:'news',title:'News feed (ticker)',icon:Rss,desc:'RSS or Atom headlines that scroll in the Breaking News ticker.',state:news?.headlines?(news.tickerEnabled?'Connected':'Disabled'):news?.feeds?'Configured':'Unconnected',note:`${news?.feeds??0} saved feed(s) · ${news?.headlines??0} headline(s) on the ticker${news&&!news.tickerEnabled?' · ticker turned off':''}`,link:['breaking-news','Breaking News']},
  {id:'helpdesk',title:'Help Desk',icon:Headset,desc:"Today's tickets from Odoo: total, resolved and unresolved.",state:odooState('helpdesk'),note:odoo?.status?.helpdesk?.lastError||'Odoo Help Desk · refreshed every minute',link:null},
  {id:'tasks',title:'Daily tasks',icon:ListChecks,desc:"Today's Odoo project tasks: total, finished, unfinished and a list of what is still open.",state:odooState('tasks'),note:odoo?.status?.tasks?.lastError||'Odoo Project · refreshed every minute',link:null},
  {id:'media',title:'Media playback',icon:MonitorPlay,desc:'Authorized channel, video, replay and radio sources.',state:data?.mediaConfigured?'Configured':'Unconnected',note:'Server-managed playback references',link:null},
 ];
 return <><PageHeading eyebrow="PLATFORM CONNECTIONS" title="Integrations" subtitle="Connect operational systems and authorized media providers to MADAR."/>
  <div className="integration-grid">{cards.map(x=><Card key={x.id}><div className="integration-icon"><x.icon size={26}/></div><h2>{x.title}</h2><p>{x.desc}</p><Status value={x.state}/><small className="block-muted integration-note">{x.note}</small>{x.link&&<button className="row-action integration-link" onClick={()=>go(x.link![0])}>{x.link[1]} <ArrowUpRight size={13}/></button>}</Card>)}</div>
  <ConnectorPanel id="spacehub" settings={spacehub} role={role} onSaved={()=>refetch()}/>
  <ConnectorPanel id="serveiq" settings={serveiq} role={role} onSaved={()=>refetch()}/>
  <OdooPanel settings={odoo} role={role} onSaved={()=>refetch()}/>
  <Card><h3><Cable size={18}/> Connection contract</h3><p className="integration-copy">Meeting and queue systems send normalized snapshots to the backend. Service credentials are kept on the server. The developer guide contains the fields, authentication method, sample payloads and simulator command.</p><div className="info-strip">{data?.ingestConfigured?'Integration key configured.':'No integration key configured. Set INTEGRATION_KEY on the server before sending live data.'}</div></Card>
  <SourceImportPanel role={role}/>{f.node}</>
}

const connectorCopy:Record<ConnectorId,{title:string;intro:string;url:string;note:string}>={
 spacehub:{title:'SpaceHub connection · Meeting rooms',intro:'MADAR signs in to SpaceHub with a display account and reads the same room summary as the SpaceHub TV: rooms, the meeting in progress, the next booking and free/busy totals. Create a user with the DISPLAY role in SpaceHub for this.',url:'https://spacehub.example.com/spacehub/api',note:'Meeting Rooms in the TV Info Hub (Live Status tab) show SpaceHub rooms while this is on. Screens on Public, VIP and Signage profiles show booked meetings as “Reserved”. Data refreshes every 15 seconds.'},
 serveiq:{title:'ServeIQ connection · Queue management',intro:'MADAR reads the branch display that the ServeIQ TV shows: tickets being called, counter status, waiting and served today. This endpoint needs no login; enter the branch ID from ServeIQ.',url:'https://serveiq.example.com/serveiq/api',note:'Queue Management in the TV Info Hub (Live Status tab) shows this ServeIQ branch while this is on. Data refreshes every 15 seconds.'},
};

function ConnectorPanel({id,settings,role,onSaved}:{id:ConnectorId;settings?:ConnectorSettings;role:string;onSaved:()=>void}){
 const f=useFeedback(),canEdit=role==='admin',copy=connectorCopy[id];
 const [form,setForm]=useState<{enabled:boolean;url:string;email:string;password:string;clearPassword:boolean;branchId:string}|null>(null),[busy,setBusy]=useState(''),[result,setResult]=useState<Record<string,any>|null>(null);
 useEffect(()=>{if(settings&&!form)setForm({enabled:settings.enabled,url:settings.url,email:settings.email||'',password:'',clearPassword:false,branchId:settings.branchId||''})},[settings]);
 if(!form||!settings)return null;
 const set=(patch:Partial<typeof form>)=>setForm({...form,...patch});
 const body=id==='spacehub'?{enabled:form.enabled,url:form.url,email:form.email,...(form.password?{password:form.password}:{}),...(form.clearPassword?{clearPassword:true}:{})}:{enabled:form.enabled,url:form.url,branchId:form.branchId};
 async function save(test=false){setBusy(test?'test':'save');setResult(null);try{
   await request(`/api/admin/connectors/${id}`,{method:'PUT',body:JSON.stringify(body)});setForm(v=>v&&{...v,password:'',clearPassword:false});onSaved();
   if(test){setResult(await request<Record<string,any>>(`/api/admin/connectors/${id}/test`,{method:'POST',body:'{}'}));f.success(`Connected to ${id==='spacehub'?'SpaceHub':'ServeIQ'}`);onSaved()}
   else f.success('Saved. TVs show the change within about 15 seconds.');
  }catch(e){f.error(e);onSaved()}finally{setBusy('')}}
 return <Card className="odoo-panel">
  <div className="card-head"><div><h3><PlugZap size={18}/> {copy.title}</h3><p>{copy.intro}</p></div><Status value={!settings.configured?'Unconnected':!settings.enabled?'Disabled':settings.status?.lastError?'Error':'Configured'}/></div>
  <form className="normal-form" onSubmit={e=>{e.preventDefault();save(true)}}>
   <fieldset disabled={!canEdit} className="odoo-fieldset">
    <label className="checkline"><input type="checkbox" checked={form.enabled} onChange={e=>set({enabled:e.target.checked})}/> Show {id==='spacehub'?'SpaceHub rooms':'ServeIQ queues'} on TVs</label>
    <div className="form-grid">
     <FormField label="API address" help="Include the /api path, as in the TV app's settings."><input type="url" placeholder={copy.url} value={form.url} onChange={e=>set({url:e.target.value})}/></FormField>
     {id==='spacehub'?<>
      <FormField label="Display account email"><input autoComplete="off" placeholder="tv-display@example.com" value={form.email} onChange={e=>set({email:e.target.value})}/></FormField>
      <FormField label="Password" help={settings.passwordFromEnvironment?'Using SPACEHUB_PASSWORD from the server environment.':settings.passwordConfigured?'A password is saved. Leave blank to keep it.':'The display account password.'}><div className="odoo-key"><KeyRound size={15}/><input type="password" autoComplete="new-password" placeholder={settings.passwordConfigured?'•••••••• saved':'Password'} value={form.password} onChange={e=>set({password:e.target.value,clearPassword:false})}/></div></FormField>
     </>:<FormField label="Branch ID" help="The ServeIQ branch whose queue this shows."><input placeholder="142c62ee-298f-4b8a-a8d3-d3e300fd4ff4" value={form.branchId} onChange={e=>set({branchId:e.target.value})}/></FormField>}
    </div>
    {id==='spacehub'&&settings.passwordConfigured&&!settings.passwordFromEnvironment&&<label className="checkline"><input type="checkbox" checked={form.clearPassword} onChange={e=>set({clearPassword:e.target.checked,password:''})}/> Remove the saved password</label>}
    <div className="form-actions"><Button variant="secondary" icon={Save} loading={busy==='save'} onClick={()=>save(false)}>Save</Button><Button type="submit" icon={PlugZap} loading={busy==='test'}>Save & test connection</Button></div>
   </fieldset>
  </form>
  {result&&<div className="odoo-result"><div><strong>Connected</strong><span>{id==='spacehub'?`${result.rooms} rooms · ${result.ongoing} in use · ${result.availableRooms} free · ${result.upcoming} upcoming today`:`${result.branchName||'Branch'} · ${result.counters} counters · ${result.waiting} waiting · ${result.servedToday} served today · ${result.calls} recent calls`}</span></div></div>}
  {settings.status?.lastError&&!result&&<div className="info-strip">Last error: {settings.status.lastError}</div>}
  <div className="info-strip">{copy.note}</div>
  {f.node}
 </Card>;
}

function OdooPanel({settings,role,onSaved}:{settings?:OdooSettings;role:string;onSaved:()=>void}){
 const f=useFeedback(),client=useQueryClient(),canEdit=role==='admin';
 const [form,setForm]=useState<OdooForm|null>(null),[busy,setBusy]=useState(''),[result,setResult]=useState<TestResult|null>(null);
 useEffect(()=>{if(settings&&!form){const v=settings;setForm({enabled:v.enabled,url:v.url,database:v.database,username:v.username,timezone:v.timezone,taskScope:v.taskScope,weekStart:v.weekStart||'sunday',helpdesk:v.helpdesk,tasks:v.tasks,profiles:v.profiles,apiKey:'',clearApiKey:false})}},[settings]);
 if(!form||!settings)return null;
 const set=(patch:Partial<OdooForm>)=>setForm({...form,...patch});
 async function save(test=false){setBusy(test?'test':'save');try{
   await request('/api/admin/odoo',{method:'PUT',body:JSON.stringify(form)});setForm(v=>v&&{...v,apiKey:'',clearApiKey:false});
   await client.invalidateQueries({queryKey:['integrations']});onSaved();
   if(test){const r=await request<TestResult>('/api/admin/odoo/test',{method:'POST',body:'{}'});setResult(r);const errors=[r.helpdesk?.error,r.tasks?.error].filter(Boolean);if(errors.length)f.error(errors.join(' · '));else f.success('Connected to Odoo');await client.invalidateQueries({queryKey:['integrations']})}
   else f.success('Odoo settings saved. TVs receive the change on their next sync.');
  }catch(e){f.error(e)}finally{setBusy('')}}
 return <Card className="odoo-panel">
  <div className="card-head"><div><h3><PlugZap size={18}/> Odoo connection · Help Desk & Daily tasks</h3><p>MADAR reads Odoo through its external API with a user login and API key. In Odoo, open your user's Preferences, then Account Security, then New API Key.</p></div><Status value={!settings.configured?'Unconnected':settings.enabled?'Configured':'Disabled'}/></div>
  <form className="normal-form" onSubmit={e=>{e.preventDefault();save(true)}}>
   <fieldset disabled={!canEdit} className="odoo-fieldset">
    <label className="checkline"><input type="checkbox" checked={form.enabled} onChange={e=>set({enabled:e.target.checked})}/> Show Odoo data on TVs</label>
    <div className="form-grid">
     <FormField label="Odoo address"><input type="url" placeholder="https://odoo.example.com" value={form.url} onChange={e=>set({url:e.target.value})}/></FormField>
     <FormField label="Database"><input placeholder="omnicallcrm" value={form.database} onChange={e=>set({database:e.target.value})}/></FormField>
     <FormField label="User (login email)"><input autoComplete="off" placeholder="manager@example.com" value={form.username} onChange={e=>set({username:e.target.value})}/></FormField>
     <FormField label="API key" help={settings.apiKeyFromEnvironment?'Using ODOO_API_KEY from the server environment.':settings.apiKeyConfigured?'A key is saved. Leave blank to keep it.':'Paste the key generated in Odoo.'}><div className="odoo-key"><KeyRound size={15}/><input type="password" autoComplete="new-password" placeholder={settings.apiKeyConfigured?'•••••••• saved':'Paste API key'} value={form.apiKey} onChange={e=>set({apiKey:e.target.value,clearApiKey:false})}/></div></FormField>
     <FormField label="Time zone for “today”" help={`Leave blank to use the server time zone (${settings.effectiveTimezone}).`}><input placeholder="Asia/Muscat" value={form.timezone} onChange={e=>set({timezone:e.target.value})}/></FormField>
     <FormField label="Daily tasks are" help="Which Odoo tasks count as today's tasks."><select value={form.taskScope} onChange={e=>set({taskScope:e.target.value as OdooForm['taskScope']})}><option value="deadline">Tasks with a deadline today</option><option value="created">Tasks created today</option></select></FormField>
     <FormField label="Week starts on" help="Work & Support's This week view counts from this day, in the time zone above."><select value={form.weekStart} onChange={e=>set({weekStart:e.target.value as OdooForm['weekStart']})}><option value="sunday">Sunday (Sunday to Thursday week)</option><option value="monday">Monday</option><option value="saturday">Saturday</option></select></FormField>
    </div>
    <div className="odoo-toggles"><label className="checkline"><input type="checkbox" checked={form.helpdesk} onChange={e=>set({helpdesk:e.target.checked})}/><Headset size={15}/> Help Desk</label><label className="checkline"><input type="checkbox" checked={form.tasks} onChange={e=>set({tasks:e.target.checked})}/><ListChecks size={15}/> Daily tasks</label></div>
    <div className="access-pages"><strong>Show on these profiles (none ticked = all)</strong><div className="page-allow-list">{profiles.map(([id,label])=><label className="checkline" key={id}><input type="checkbox" checked={form.profiles.includes(id)} onChange={e=>set({profiles:e.target.checked?[...form.profiles,id]:form.profiles.filter(p=>p!==id)})}/>{label}</label>)}</div></div>
    {settings.apiKeyConfigured&&!settings.apiKeyFromEnvironment&&<label className="checkline"><input type="checkbox" checked={form.clearApiKey} onChange={e=>set({clearApiKey:e.target.checked,apiKey:''})}/> Remove the saved API key</label>}
    <div className="form-actions"><Button variant="secondary" icon={Save} loading={busy==='save'} onClick={()=>save(false)}>Save</Button><Button type="submit" icon={PlugZap} loading={busy==='test'}>Save & test connection</Button></div>
   </fieldset>
  </form>
  {result&&<div className="odoo-result">
   <div><Headset size={16}/><strong>Help Desk</strong>{result.helpdesk?.error?<span className="odoo-error">{result.helpdesk.error}</span>:result.helpdesk?.skipped?<span>Turned off</span>:<span>{result.helpdesk?.total} today · {result.helpdesk?.resolved} resolved · {result.helpdesk?.unresolved} unresolved</span>}</div>
   <div><ListChecks size={16}/><strong>Daily tasks</strong>{result.tasks?.error?<span className="odoo-error">{result.tasks.error}</span>:result.tasks?.skipped?<span>Turned off</span>:<span>{result.tasks?.total} today · {result.tasks?.finished} finished · {result.tasks?.unfinished} unfinished</span>}</div>
  </div>}
  <div className="info-strip">Help Desk and Daily tasks appear in the TV Info Hub under the Management tab, and can be placed on any page with the Page Builder. Data refreshes every minute.</div>
  {f.node}
 </Card>;
}
