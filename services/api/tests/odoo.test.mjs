import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';
import {dayRange,odooUrl,odooClient,helpdeskSnapshot,taskSnapshot} from '../src/odoo.mjs';

// A small stand-in for Odoo's /jsonrpc endpoint (Odoo 17 shape: project.task has a state field).
const calls=[];let odooDown=false;
function fakeOdoo(url,init){
  const {params:{service,method,args}}=JSON.parse(init.body);calls.push({url,service,method,args});
  const reply=result=>({ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:1,result})});
  if(odooDown)return Promise.reject(new Error('ECONNREFUSED'));
  if(service==='common')return Promise.resolve(reply(args[2]==='good-key'?7:false));
  const [,,,model,op,opArgs=[],kw={}]=args;
  if(op==='fields_get')return Promise.resolve(reply(model==='helpdesk.ticket'?{name:{type:'char'},stage_id:{type:'many2one'},create_date:{type:'datetime'}}:{name:{type:'char'},state:{type:'selection',selection:[['01_in_progress','In Progress'],['1_done','Done'],['1_canceled','Cancelled']]},date_deadline:{type:'datetime'},user_ids:{type:'many2many'},project_id:{type:'many2one'},stage_id:{type:'many2one'},priority:{type:'selection'}}));
  const domain=JSON.stringify(opArgs[0]||[]);
  if(op==='search_count'&&model==='helpdesk.ticket')return Promise.resolve(reply(domain.includes('stage_id.fold')?5:8));
  if(op==='search_count'&&model==='project.task')return Promise.resolve(reply(domain.includes('"1_done"')?3:4));
  if(op==='search_read')return Promise.resolve(reply([{id:41,name:'Call back VIP customer',project_id:[2,'Customer Care'],user_ids:[9],date_deadline:'2026-11-04 10:00:00',stage_id:[3,'In Progress'],priority:'1'}].slice(0,kw.limit)));
  if(op==='read'&&model==='res.users')return Promise.resolve(reply([{id:9,name:'Amal'}]));
  return Promise.resolve({ok:true,status:200,json:async()=>({error:{message:'Odoo Server Error',data:{name:'builtins.KeyError',message:`Object ${model} doesn't exist`}}})});
}

let db,app,admin;
const managementTv='madar-demo-screen-token-only-2',publicTv='madar-demo-screen-token-only-1';
const send=(url,body,method='post')=>admin[method](url).set('X-Madar-Request','1').send(body);
const tv=(url,key)=>request(app).get(url).set('X-Screen-Key',key);
const settings={enabled:true,url:'https://odoo.example.com/',database:'omnicallcrm',username:'manager@example.com',apiKey:'good-key',timezone:'Asia/Muscat',taskScope:'deadline',helpdesk:true,tasks:true,profiles:['management']};
before(async()=>{db=await openDatabase({memory:true,url:''});await seed(db,{demo:true});app=createApp({db,demo:true,odooFetch:fakeOdoo});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200)});
after(()=>db.close());

test('today follows the configured time zone and is sent to Odoo in UTC',()=>{
  assert.deepEqual(dayRange('Asia/Muscat',Date.parse('2026-11-04T21:30:00Z')),{day:'2026-11-05',start:'2026-11-04 20:00:00',end:'2026-11-05 20:00:00'});
  assert.deepEqual(dayRange('UTC',Date.parse('2026-11-04T00:00:00Z')),{day:'2026-11-04',start:'2026-11-04 00:00:00',end:'2026-11-05 00:00:00'});
  // Daylight saving day in New York is 25 hours long.
  assert.deepEqual(dayRange('America/New_York',Date.parse('2026-11-01T12:00:00Z')),{day:'2026-11-01',start:'2026-11-01 04:00:00',end:'2026-11-02 05:00:00'});
  assert.equal(odooUrl('https://odoo.example.com/'),'https://odoo.example.com');
  assert.throws(()=>odooUrl('ftp://odoo'),/http/);assert.throws(()=>odooUrl('http://169.254.169.254'),/metadata/);
});

test('Help Desk counts today\'s tickets and Daily Tasks lists the unfinished ones',async()=>{
  const client=odooClient(settings,{fetchImpl:fakeOdoo}),now=Date.parse('2026-11-04T08:00:00Z');
  assert.deepEqual(await helpdeskSnapshot(client,settings,now),{day:'2026-11-04',total:8,resolved:5,unresolved:3});
  const tasks=await taskSnapshot(client,settings,now);
  assert.equal(tasks.total,4);assert.equal(tasks.finished,3);assert.equal(tasks.unfinished,1);
  assert.deepEqual(tasks.items[0],{id:41,name:'Call back VIP customer',project:'Customer Care',assignees:['Amal'],deadline:'2026-11-04 10:00:00',stage:'In Progress',priority:'1'});
  const read=calls.find(c=>c.method==='execute_kw'&&c.args[4]==='search_read');
  assert.ok(JSON.stringify(read.args[5]).includes('"!",["state","=","1_done"]'));
  assert.ok(JSON.stringify(read.args[5]).includes('["state","!=","1_canceled"]'));
  assert.equal(read.url,'https://odoo.example.com/jsonrpc');
  await assert.rejects(odooClient({...settings,apiKey:'bad'},{fetchImpl:fakeOdoo}).login(),/rejected/);
});

test('without Odoo settings the demo shows sample data; the API key is never returned',async()=>{
  let {body:ops}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(ops.helpdesk.availability,'simulated');assert.equal(ops.tasks.items.length,4);
  await send('/api/admin/odoo',{...settings,enabled:true,apiKey:''},'put').expect(422);
  await admin.put('/api/admin/odoo').send(settings).expect(403);
  const {body:saved}=await send('/api/admin/odoo',settings,'put').expect(200);
  assert.equal(saved.apiKey,undefined);assert.equal(saved.apiKeyConfigured,true);assert.equal(saved.url,'https://odoo.example.com');
  const {body:read}=await admin.get('/api/admin/odoo').expect(200);assert.equal(read.apiKey,undefined);assert.equal(read.database,'omnicallcrm');
  // Leaving the key blank keeps the saved one.
  await send('/api/admin/odoo',{...settings,apiKey:'',timezone:'Asia/Dubai'},'put').expect(200);
  assert.equal((await one(db,"SELECT value FROM settings WHERE key='odoo'")).value.apiKey,'good-key');
  await send('/api/admin/odoo',{...settings,timezone:'Mars/Olympus'},'put').expect(422);
  const audit=await one(db,"SELECT detail FROM audit WHERE action='update-odoo' ORDER BY id DESC LIMIT 1");assert.ok(!JSON.stringify(audit.detail).includes('good-key'));
});

test('management TVs get live Odoo data; other profiles do not get the pages',async()=>{
  await send('/api/admin/odoo',settings,'put').expect(200);
  const {body:test}=await send('/api/admin/odoo/test',{}).expect(200);
  assert.equal(test.uid,7);assert.equal(test.helpdesk.total,8);assert.equal(test.tasks.unfinished,1);
  const {body:ops}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(ops.helpdesk.availability,'connected');assert.equal(ops.helpdesk.resolved,5);assert.equal(ops.tasks.items[0].assignees[0],'Amal');
  const {body:pub}=await tv('/api/app/operations',publicTv).expect(200);
  assert.equal(pub.helpdesk,null);assert.equal(pub.tasks,null);
  const pages=async key=>{const {body}=await tv('/api/app/sync',key).expect(200);return Object.keys(JSON.parse(body.bundleText).pages)};
  assert.ok((await pages(managementTv)).includes('info-helpdesk'));assert.ok((await pages(managementTv)).includes('info-tasks'));
  assert.ok(!(await pages(publicTv)).includes('info-helpdesk'));
  const {body:page}=await tv('/api/app/pages/info-tasks',managementTv).expect(200);
  assert.deepEqual(page.sections.map(s=>s.type),['task_summary','task_list']);assert.equal(page.sections[1].data.unfinished,1);
  const {body:integrations}=await admin.get('/api/admin/integrations').expect(200);
  assert.equal(integrations.odoo.configured,true);assert.equal(integrations.odoo.apiKey,undefined);assert.equal(typeof integrations.news.feeds,'number');
});

test('an unreachable Odoo is reported to the TV instead of failing the request',async()=>{
  odooDown=true;
  await send('/api/admin/odoo',{...settings,timezone:'UTC'},'put').expect(200);
  const {body:ops}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(ops.helpdesk.availability,'error');assert.match(ops.helpdesk.error,/reach/);
  odooDown=false;
  await send('/api/admin/odoo',{...settings,enabled:false},'put').expect(200);
  const {body:off}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(off.helpdesk,null);
});
