import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import request from './inject-driver.mjs';
import {openDatabase} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {createApp,authenticateDevice} from '../src/app.mjs';
import {attachRemote} from '../src/remote.mjs';

const device='madar-demo-screen-token-only-1';
let db,app,admin,assets,server,io,url,remote;
const sockets=[];
const once=(socket,event)=>new Promise(resolve=>socket.once(event,resolve));
const until=async(socket,event,ok)=>{for(;;){const v=await once(socket,event);if(ok(v))return v}};
const open=(nsp,auth)=>{const s=connect(url+nsp,{auth,transports:['websocket'],reconnection:false,forceNew:true});sockets.push(s);return s};
const code=async()=>(await request(app).post('/api/app/remote/code').set('X-Screen-Key',device).send({}).expect(201)).body;
const pair=(c,label='Front desk phone')=>request(app).post('/api/remote/pair').send({code:c,label});

before(async()=>{
  delete process.env.MADAR_REMOTE_APPROVAL;
  assets=await mkdtemp(path.join(os.tmpdir(),'madar-remote-'));db=await openDatabase({memory:true});await seed(db,{demo:true});
  app=createApp({db,demo:true,assetsDir:assets});admin=request.agent(app);
  await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
  server=http.createServer(app);io=new Server(server,{transports:['websocket']});
  io.use(async(socket,next)=>{try{const s=await authenticateDevice(db,socket.handshake.auth?.deviceKey);socket.data.screenId=s.id;next()}catch{next(Error('Invalid device credential'))}});
  io.on('connection',socket=>socket.join(socket.data.screenId));
  remote=attachRemote({io,db,events:app.locals.events,app});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
});
after(async()=>{for(const s of sockets)s.close();remote?.stop();await new Promise(r=>io.close(r));await db?.close();await rm(assets,{recursive:true,force:true})});

test('a phone pairs with a TV code, waits for approval, then its keys reach the TV',async()=>{
  const tv=open('/',{deviceKey:device});await once(tv,'connect');
  const seen=[];
  tv.on('remote-command',(m,ack)=>{seen.push(m.action);assert.ok(m.expiresAt>Date.now());ack({outcome:m.action==='playPause'?'blocked':'applied'})});
  const pairedOnTv=once(tv,'remote-paired');

  const c=await code();
  assert.match(c.code,/^\d{6}$/);assert.equal(c.ttl,120);assert.equal(c.approvalRequired,true);
  await pair('000000'===c.code?'000001':'000000').expect(422);
  const {body:p}=await pair(c.code).expect(201);
  assert.equal(p.status,'pending');assert.equal(p.tvName,'Reception · Main lobby');assert.ok(p.token.length>20);
  assert.deepEqual(await pairedOnTv,{approvalPending:true,label:'Front desk phone'});
  await pair(c.code).expect(422);// codes are single use

  const phone=open('/remote',{token:p.token});
  const first=await once(phone,'status');
  assert.equal(first.status,'pending');assert.equal(first.online,true);
  assert.deepEqual(await phone.timeout(3000).emitWithAck('command',{id:'1',action:'ok'}),{error:'This phone is not allowed to control the TV'});

  const {body:list}=await admin.get('/api/admin/remote-pairings').expect(200);
  const row=list.pairings.find(x=>x.id===p.pairingId);
  assert.equal(row.status,'pending');assert.equal(row.tvOnline,true);assert.equal(row.label,'Front desk phone');
  const approved=until(phone,'status',s=>s.status==='active');
  await admin.post(`/api/admin/remote-pairings/${p.pairingId}/approve`).set('X-Madar-Request','1').send({}).expect(200);
  await approved;
  await admin.post(`/api/admin/remote-pairings/${p.pairingId}/approve`).set('X-Madar-Request','1').send({}).expect(409);

  const r=await phone.timeout(4000).emitWithAck('command',{id:'2',action:'right'});
  assert.deepEqual(r,{id:'2',applied:1,blocked:0,unavailable:0,total:1});
  const b=await phone.timeout(4000).emitWithAck('command',{id:'3',action:'playPause'});
  assert.equal(b.blocked,1);
  assert.deepEqual(await phone.timeout(3000).emitWithAck('command',{id:'4',action:'volumeUp'}),{error:'Unknown control'});
  assert.deepEqual(seen,['right','playPause']);

  const {body:session}=await request(app).get('/api/remote/session').set('Authorization','Bearer '+p.token).expect(200);
  assert.equal(session.status,'active');

  const ended=until(phone,'status',s=>s.status==='ended');
  await admin.post(`/api/admin/remote-pairings/${p.pairingId}/revoke`).set('X-Madar-Request','1').send({}).expect(200);
  assert.equal((await ended).reason,'revoked');
  const again=open('/remote',{token:p.token});
  assert.match((await once(again,'connect_error')).message,/not paired/);
  tv.close();
});

test('a TV that is off reports unavailable; rejecting and unpairing end the pairing',async()=>{
  const {body:p}=await pair((await code()).code,'Spare phone').expect(201);
  const phone=open('/remote',{token:p.token});const s=await once(phone,'status');assert.equal(s.online,false);
  await admin.post(`/api/admin/remote-pairings/${p.pairingId}/reject`).set('X-Madar-Request','1').send({}).expect(200);
  const {body:gone}=await request(app).get('/api/remote/session').set('Authorization','Bearer '+p.token).expect(200);
  assert.deepEqual([gone.status,gone.reason],['ended','rejected']);

  process.env.MADAR_REMOTE_APPROVAL='0';
  try{
    const {body:direct}=await pair((await code()).code,'Direct phone').expect(201);
    assert.equal(direct.status,'active');
    const ph=open('/remote',{token:direct.token});await until(ph,'status',x=>x.status==='active');
    assert.deepEqual(await ph.timeout(4000).emitWithAck('command',{id:'a',action:'home'}),{id:'a',applied:0,blocked:0,unavailable:0,total:0});
    await request(app).post('/api/remote/unpair').set('Authorization','Bearer '+direct.token).expect(200);
    const {body:after}=await request(app).get('/api/remote/session').set('Authorization','Bearer '+direct.token).expect(200);
    assert.deepEqual([after.status,after.reason],['ended','unpaired']);
  }finally{delete process.env.MADAR_REMOTE_APPROVAL}
  const tv=open('/',{deviceKey:device});await once(tv,'connect');
  const shown=once(tv,'remote-code');
  const {body:fromAdmin}=await admin.post('/api/admin/screens/demo-screen-1/remote-code').set('X-Madar-Request','1').send({}).expect(201);
  assert.equal(fromAdmin.tvOnline,true);
  assert.deepEqual(await shown,{code:fromAdmin.code,ttl:120});
  const {body:viaAdmin}=await pair(fromAdmin.code,'Admin code phone').expect(201);
  assert.equal(viaAdmin.status,'pending');
  await admin.post('/api/admin/screens/missing/remote-code').set('X-Madar-Request','1').send({}).expect(404);
  tv.close();
  await request(app).post('/api/app/remote/code').send({}).expect(401);
  await request(app).get('/api/admin/remote-pairings').expect(401);
});
