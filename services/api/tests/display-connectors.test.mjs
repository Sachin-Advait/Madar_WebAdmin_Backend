import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';
import {mapSpaceHub,mapServeIq} from '../src/display-connectors.mjs';

// Stand-ins for the SpaceHub and ServeIQ APIs, shaped like their TV endpoints.
const calls=[];let spaceDown=false,expireToken=false,logins=0;
const tvDisplay={currentRooms:[
  {id:'r1',name:'Boardroom',arabicName:'قاعة الاجتماعات',capacity:12,booked:true,currentMeeting:{organizer:'Amal',title:'Budget review',startTime:'2026-11-09T09:00:00',endTime:'2026-11-09T10:00:00',attendees:8,department:'Finance'}},
  {id:'r2',name:'Training 1',arabicName:'',capacity:20,booked:false,currentMeeting:null}],
 upcomingRooms:[
  {id:'r2',name:'Training 1',capacity:20,booked:true,currentMeeting:{organizer:'Omar',title:'Onboarding',startTime:'2026-11-09T11:00:00',endTime:'2026-11-09T12:00:00',attendees:15,department:'HR'}},
  {id:'r3',name:'Meeting C',capacity:6,booked:true,currentMeeting:{organizer:'Sara',title:'Vendor call',startTime:'2026-11-09T10:30:00',endTime:'2026-11-09T11:00:00',attendees:3,department:'IT'}}],
 statistics:{totalRooms:3,busyRooms:1,freeRooms:2}};
const queueDisplay={latestCalls:[{token:'A-101',counter:'Counter 02',service:'Pensions'},{token:'B-017',counter:'Counter 01',service:'Documents'}],
 nowServing:[{token:'A-100',counter:'Counter 03',service:'Pensions'}],upcomingTokens:['A-102','A-103','B-018'],holdTokens:['A-090'],
 counters:[{counter:'Counter 01',code:'C1',status:'CALLING',token:'B-017'},{counter:'Counter 02',code:'C2',status:'SERVING',token:'A-101'},{counter:'Counter 03',code:'C3',status:'IDLE',token:null},{counter:'Counter 04',code:'C4',status:'PAUSED',token:null},{counter:'Counter 05',code:'C5',status:'CLOSED',token:null}],
 branchName:'Muscat HQ',waiting:3,serving:2,noShow:1,servedToday:42};
function reply(body,status=200){return Promise.resolve({ok:status<400,status,json:async()=>body})}
function fakeFetch(url,init={}){
  calls.push({url,method:init.method||'GET',auth:init.headers?.Authorization});
  if(url.startsWith('https://space.example/spacehub/api')){
    if(spaceDown)return Promise.reject(new Error('ECONNREFUSED'));
    if(url.endsWith('/auth/login')){logins++;const b=JSON.parse(init.body);return b.password==='display-pass'?reply({status:200,message:'ok',data:{token:'tok-'+logins,tokenType:'Bearer',expiresInSeconds:7776000,role:'DISPLAY'}}):reply({status:401,message:'Bad credentials'},401)}
    if(url.endsWith('/tv-display')){
      if(expireToken&&init.headers?.Authorization==='Bearer tok-1')return reply({status:401},401);
      return init.headers?.Authorization?.startsWith('Bearer tok-')?reply({status:200,message:'ok',data:tvDisplay}):reply({},401);
    }
  }
  if(url==='https://queue.example/serveiq/api/tv-display/branch/branch-1')return reply(queueDisplay);
  return reply({},404);
}

let db,app,admin;
const publicTv='madar-demo-screen-token-only-1',managementTv='madar-demo-screen-token-only-2';
const send=(url,body,method='post')=>admin[method](url).set('X-Madar-Request','1').send(body);
const tv=(url,key)=>request(app).get(url).set('X-Screen-Key',key);
before(async()=>{db=await openDatabase({memory:true,url:''});await seed(db,{demo:true});app=createApp({db,demo:true,connectorFetch:fakeFetch});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200)});
after(()=>db.close());

test('SpaceHub rooms map to MADAR meeting data with current and next meetings',()=>{
  const m=mapSpaceHub(tvDisplay);
  assert.equal(m.ongoing,1);assert.equal(m.availableRooms,2);assert.equal(m.totalRooms,3);assert.equal(m.todayMeetings,3);
  const board=m.rooms.find(r=>r.name==='Boardroom');
  assert.equal(board.status,'occupied');assert.equal(board.nameAr,'قاعة الاجتماعات');
  assert.deepEqual(board.current,{title:'Budget review',start:'2026-11-09T09:00:00',end:'2026-11-09T10:00:00'});
  const training=m.rooms.find(r=>r.name==='Training 1');
  assert.equal(training.status,'available');assert.deepEqual(training.next,{title:'Onboarding',start:'2026-11-09T11:00:00'});
  assert.deepEqual(m.schedule.map(s=>s.title),['Vendor call','Onboarding']);
  assert.deepEqual(m.rooms.map(r=>r.name),['Boardroom','Training 1','Meeting C']);
});

test('ServeIQ branch display maps to MADAR queue data',()=>{
  const q=mapServeIq(queueDisplay);
  assert.equal(q.servedToday,42);assert.equal(q.waiting,3);assert.equal(q.branchName,'Muscat HQ');
  assert.deepEqual(q.calls[0],{ticket:'A-101',counter:'Counter 02',service:'Pensions',ticketAr:''});
  assert.deepEqual(q.counters.map(c=>c.status),['serving','serving','available','paused','closed']);
  assert.equal(q.counters[0].calling,true);
  assert.equal(q.activeCounters,3);
  // Missing counts fall back to the lists.
  assert.equal(mapServeIq({upcomingTokens:['A','B']}).waiting,2);
});

test('settings are validated, the SpaceHub password is never returned, and Test reports what it found',async()=>{
  await send('/api/admin/connectors/spacehub',{enabled:true,url:'https://space.example/spacehub/api',email:'tv@example.com'},'put').expect(422);
  await admin.put('/api/admin/connectors/spacehub').send({enabled:false,url:'',email:''}).expect(403);
  await send('/api/admin/connectors/spacehub',{enabled:false,url:'ftp://space.example',email:''},'put').expect(422);
  const {body:saved}=await send('/api/admin/connectors/spacehub',{enabled:true,url:'https://space.example/spacehub/api/',email:'tv@example.com',password:'display-pass'},'put').expect(200);
  assert.equal(saved.password,undefined);assert.equal(saved.passwordConfigured,true);assert.equal(saved.url,'https://space.example/spacehub/api');
  // Leaving the password blank keeps the saved one.
  await send('/api/admin/connectors/spacehub',{enabled:true,url:'https://space.example/spacehub/api',email:'tv@example.com'},'put').expect(200);
  assert.equal((await one(db,"SELECT value FROM settings WHERE key='spacehub'")).value.password,'display-pass');
  const {body:read}=await admin.get('/api/admin/connectors/spacehub').expect(200);assert.equal(read.password,undefined);
  const audit=await one(db,"SELECT detail FROM audit WHERE action='update-spacehub' ORDER BY id DESC LIMIT 1");assert.ok(!JSON.stringify(audit.detail).includes('display-pass'));
  const {body:t1}=await send('/api/admin/connectors/spacehub/test',{}).expect(200);
  assert.deepEqual(t1,{rooms:3,ongoing:1,availableRooms:2,upcoming:2});
  await send('/api/admin/connectors/serveiq',{enabled:true,url:'https://queue.example/serveiq/api',branchId:'branch-1'},'put').expect(200);
  const {body:t2}=await send('/api/admin/connectors/serveiq/test',{}).expect(200);
  assert.deepEqual(t2,{branchName:'Muscat HQ',counters:5,waiting:3,servedToday:42,calls:2});
  const {body:integrations}=await admin.get('/api/admin/integrations').expect(200);
  assert.equal(integrations.spacehub.configured,true);assert.equal(integrations.spacehub.password,undefined);assert.equal(integrations.serveiq.branchId,'branch-1');
});

test('TVs get SpaceHub and ServeIQ data through /api/app/operations; public screens see no meeting titles',async()=>{
  const {body:ops}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(ops.meeting.source,'spacehub');assert.equal(ops.meeting.availability,'connected');
  assert.equal(ops.meeting.rooms[0].current.title,'Budget review');
  assert.equal(ops.queue.source,'serveiq');assert.equal(ops.queue.calls[0].ticket,'A-101');
  // ServeIQ's display endpoint is public: MADAR sends no credentials.
  assert.ok(calls.filter(c=>c.url.includes('serveiq')).every(c=>!c.auth));
  const {body:pub}=await tv('/api/app/operations',publicTv).expect(200);
  assert.equal(pub.meeting.rooms[0].current.title,'Reserved');assert.ok(pub.meeting.schedule.every(s=>s.title==='Reserved'));
  assert.equal(pub.meeting.rooms[0].name,'Boardroom');
});

test('an expired SpaceHub token logs in again; an outage keeps the last data, marked stale',async()=>{
  // Fresh settings clear the cache; the first login issued tok-1 earlier.
  await send('/api/admin/connectors/spacehub',{enabled:true,url:'https://space.example/spacehub/api',email:'tv@example.com'},'put').expect(200);
  expireToken=true;const before=logins;
  const {body:ops}=await tv('/api/app/operations',managementTv).expect(200);
  assert.equal(ops.meeting.availability,'connected');assert.ok(logins>before);
  expireToken=false;spaceDown=true;
  // Past the 15-second cache, the next request hits the outage.
  await send('/api/admin/connectors/serveiq',{enabled:true,url:'https://queue.example/serveiq/api',branchId:'branch-1'},'put').expect(200);
  const realNow=Date.now;Date.now=()=>realNow()+20000;
  try{
    const {body:stale}=await tv('/api/app/operations',managementTv).expect(200);
    assert.equal(stale.meeting.availability,'stale');assert.match(stale.meeting.error,/reach/);assert.equal(stale.meeting.rooms.length,3);
  }finally{Date.now=realNow}
  spaceDown=false;
  // Turned off: the TV falls back to the other sources again.
  await send('/api/admin/connectors/spacehub',{enabled:false,url:'https://space.example/spacehub/api',email:'tv@example.com'},'put').expect(200);
  const {body:off}=await tv('/api/app/operations',managementTv).expect(200);
  assert.notEqual(off.meeting.source,'spacehub');
});
