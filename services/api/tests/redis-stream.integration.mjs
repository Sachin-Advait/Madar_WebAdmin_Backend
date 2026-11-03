import {test, before, beforeEach, afterEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from 'redis';
import {openDatabase, one, rows} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {queueDevice, releaseProfile} from '../src/releases.mjs';
import {DeliveryStream} from '../src/delivery-stream.mjs';
import {createApp} from '../src/app.mjs';
import request from './inject-driver.mjs';

if (!process.env.TEST_REDIS_URL) throw Error('Set TEST_REDIS_URL to a dedicated Redis test service; tests are never silently skipped.');
let redis, db, worker, app, emitted, stream, sqlPool, schema;
const group = 'madar-dispatchers';
const deviceKey = 'madar-demo-screen-token-only-1';
const command = (...args) => redis.sendCommand(args.map(String));
const pending = () => command('XPENDING', stream, group);
const length = () => command('XLEN', stream);
const delivery = () => one(db, "SELECT d.*,r.digest FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE screen_id='demo-screen-1' AND d.status<>'superseded'");
const due = () => db.query("UPDATE deliveries SET next_attempt=now() WHERE status IN ('pending','received','downloaded','failed')");
const makeWorker = options => new DeliveryStream({db, redis, stream, group, consumer: randomUUID(), emit: (screen, value) => emitted.push({screen, ...value}), ...options});
async function ack(stage, d, key=deviceKey) {
  return request(app).post('/api/app/ack').set('X-Screen-Key', key)
    .send({deliveryId:d.id, digest:d.digest, stage});
}
async function apply(d=undefined) {
  d ??= await delivery();
  for (const stage of ['received','downloaded','applied']) {
    const r=await ack(stage,d); assert.equal(r.status,200,JSON.stringify(r.body));
  }
  return d;
}

before(async () => {
  redis=createClient({url:process.env.TEST_REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:5000,reconnectStrategy:false}});
  redis.on('error',()=>{});
  await redis.connect();
  const info=await command('INFO','server');
  console.log('Redis integration server: '+info.match(/redis_version:([^\r\n]+)/)?.[1]);
  if(process.env.TEST_DATABASE_URL){const {Pool}=await import('pg');sqlPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});}
});
beforeEach(async () => {
  stream='madar-test:{'+randomUUID()+'}:delivery';
  let url='';
  if(sqlPool){
    schema='madar_stream_'+randomUUID().replaceAll('-','');
    await sqlPool.query('CREATE SCHEMA "'+schema+'"');
    const connection=new URL(process.env.TEST_DATABASE_URL);
    connection.searchParams.set('options','-c search_path='+schema);url=connection.toString();
  }
  db=await openDatabase({url,memory:true});
  await seed(db,{demo:true});
  emitted=[];worker=makeWorker();app=createApp({db,demo:true});
});
afterEach(async () => {
  await worker?.stop();await db?.close();
  if(redis?.isReady&&stream)await command('DEL',stream,stream+':dead');
  if(sqlPool&&schema){assert.match(schema,/^madar_stream_[a-f0-9]{32}$/);await sqlPool.query('DROP SCHEMA "'+schema+'" CASCADE');schema=null;}
});
after(async () => {if(redis?.isOpen)await redis.quit();await sqlPool?.end();});

test('XREADGROUP keeps one independent pending delivery per TV', async () => {
  assert.equal((await delivery()).stream_id,null);
  await worker.tick();
  assert.equal(await length(),4);assert.equal((await pending())[0],4);
  assert.equal(new Set(emitted.map(e=>e.screen)).size,4);
  assert.ok((await delivery()).stream_id);
  assert.equal((await delivery()).status,'pending');
});

test('Received and Downloaded never XACK; Applied retires only its own TV message', async () => {
  await worker.tick();const d=await delivery();
  for(const stage of ['received','downloaded']){
    assert.equal((await ack(stage,d)).status,200);await worker.tick();
    assert.equal((await pending())[0],4);assert.equal(await length(),4);
  }
  assert.equal((await ack('applied',d)).status,200);await worker.tick();
  assert.equal((await pending())[0],3);assert.equal(await length(),3);
  assert.equal((await ack('applied',d)).body.duplicate,true);
  await worker.tick();assert.equal((await pending())[0],3);
});

test('wrong hash, another device and premature Applied cannot clear Redis pending work', async () => {
  await worker.tick();const d=await delivery();
  assert.equal((await ack('applied',d)).status,409);
  assert.equal((await ack('received',{...d,digest:'bad'})).status,422);
  assert.equal((await ack('received',d,'madar-demo-screen-token-only-2')).status,404);
  await worker.tick();assert.equal((await pending())[0],4);
});

test('Failed delivery stays pending and is retried without a fabricated Applied ACK', async () => {
  await worker.tick();const d=await delivery();
  assert.equal((await ack('failed',d)).status,200);await due();await worker.tick();
  assert.equal((await pending())[0],4);assert.equal((await delivery()).status,'failed');
  assert.equal((await delivery()).attempts,2);
  await apply();await worker.tick();assert.equal((await pending())[0],3);
});

test('XAUTOCLAIM recovers pending messages owned by a stopped worker', async () => {
  await worker.tick();const entries=await command('XPENDING',stream,group,'-','+',100);
  await command('XCLAIM',stream,group,worker.consumer,0,...entries.map(e=>e[0]),'IDLE',61000,'JUSTID');
  const replacement=makeWorker();await due();await replacement.tick();
  const owners=await command('XPENDING',stream,group,'-','+',100);
  assert.ok(owners.every(e=>e[1]===replacement.consumer));
  assert.equal((await delivery()).attempts,2);assert.equal(owners.length,4);
  await apply();await replacement.tick();assert.equal((await pending())[0],3);
});

test('crash between XADD and SQL commit is recovered with harmless duplicate messages', async () => {
  let inject=true;
  const faultDb={...db,tx:fn=>db.tx(tx=>fn({query:async(sql,args)=>{
    if(inject&&sql.startsWith('UPDATE deliveries SET stream_id=$2')){inject=false;throw Error('Injected post-XADD crash');}
    return tx.query(sql,args);
  }}))};
  const broken=makeWorker({db:faultDb});
  await assert.rejects(broken.tick(),/Injected/);
  assert.equal(await length(),1);assert.equal((await delivery()).stream_id,null);
  await worker.tick();assert.equal(await length(),5);
  const attempts=await rows(db,'SELECT attempts FROM deliveries');assert.ok(attempts.every(d=>d.attempts===1));
  const messages=await command('XRANGE',stream,'-','+');
  const counts=new Map();for(const [,f]of messages){const id=f[f.indexOf('deliveryId')+1];counts.set(id,(counts.get(id)||0)+1);}
  const duplicateId=[...counts].find(([,n])=>n===2)[0];
  const d=await one(db,'SELECT d.*,r.digest FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE d.id=$1',[duplicateId]);
  const screen=await one(db,'SELECT id FROM screens WHERE id=$1',[d.screen_id]);
  const key='madar-demo-screen-token-only-'+screen.id.split('-').at(-1);
  for(const stage of ['received','downloaded','applied'])assert.equal((await ack(stage,d,key)).status,200);
  await worker.tick();assert.equal(await length(),3);assert.equal((await pending())[0],3);
});

test('SQL Applied ACK survives Redis being unavailable before XACK', async () => {
  await worker.tick();const d=await apply();
  const disconnected=redis.duplicate();disconnected.on('error',()=>{});await disconnected.connect();disconnected.destroy();
  const offline=makeWorker({redis:disconnected});await assert.rejects(offline.tick(),/unavailable/);
  assert.equal((await delivery()).status,'applied');assert.equal((await pending())[0],4);
  await worker.tick();assert.equal((await pending())[0],3);
  assert.equal((await ack('applied',d)).body.duplicate,true);
});

test('lost Redis stream is rebuilt from SQL without replaying completed deliveries', async () => {
  await worker.tick();await apply();await worker.tick();
  await command('DEL',stream);await assert.rejects(worker.tick(),/NOGROUP/);
  await worker.tick();assert.equal(await length(),3);assert.equal((await pending())[0],3);
  assert.equal((await delivery()).status,'applied');
});

test('missing individual Redis entry is reconciled and queued again', async () => {
  await worker.tick();const d=await delivery();await command('XDEL',stream,d.stream_id);
  worker.nextReconcile=0;await worker.tick();
  assert.notEqual((await delivery()).stream_id,d.stream_id);
  assert.equal(await length(),4);assert.equal((await pending())[0],4);
});

test('new release cancels superseded Redis work and rejects its stale Applied ACK', async () => {
  await worker.tick();const old=await delivery();
  await db.tx(tx=>releaseProfile(tx,'public','Test replacement'));
  await worker.tick();assert.equal(await length(),4);assert.equal((await pending())[0],4);
  assert.notEqual((await delivery()).id,old.id);
  assert.equal((await ack('applied',old)).status,409);
  const prior=await one(db,'SELECT status FROM deliveries WHERE id=$1',[old.id]);assert.equal(prior.status,'superseded');
});

test('disabled TV messages are cancelled; re-enabling queues a fresh stream entry', async () => {
  await worker.tick();const d=await delivery();
  await db.query("UPDATE screens SET enabled=false WHERE id='demo-screen-1'");await worker.tick();
  assert.equal((await pending())[0],3);assert.equal((await delivery()).status,'pending');
  await db.tx(async tx=>{await tx.query("UPDATE screens SET enabled=true WHERE id='demo-screen-1'");await queueDevice(tx,d.screen_id,d.release_id);});
  await worker.tick();assert.equal((await pending())[0],4);assert.notEqual((await delivery()).stream_id,d.stream_id);
});

test('pending pagination cannot let an offline TV starve later Applied acknowledgements', async () => {
  worker=makeWorker({batchSize:1});for(let i=0;i<5;i++)await worker.tick();
  assert.equal((await pending())[0],4);const d=await apply();
  for(let i=0;i<8;i++)await worker.tick();
  assert.equal((await pending())[0],3);
  assert.deepEqual(await command('XRANGE',stream,d.stream_id,d.stream_id),[]);
});

test('malformed stream message is quarantined without confirming any TV', async () => {
  await worker.ensureGroup();await command('XADD',stream,'*','unexpected','value');await worker.tick();
  assert.equal((await pending())[0],4);assert.equal(await length(),4);
  assert.equal(await command('XLEN',stream+':dead'),1);
  assert.equal((await delivery()).status,'pending');
});

test('failed publication transaction cannot leak a release into Redis', async () => {
  await worker.tick();const d=await delivery();
  await assert.rejects(db.tx(async tx=>{await releaseProfile(tx,'public','Rolled back');throw Error('Rollback');}),/Rollback/);
  await worker.tick();assert.equal(await length(),4);assert.equal((await delivery()).id,d.id);
});

test('notification failure leaves Redis work pending for a later retry', async () => {
  const broken=makeWorker({emit:()=>{throw Error('Transport unavailable');}});
  await assert.rejects(broken.tick(),/Transport unavailable/);assert.equal((await pending())[0],4);
  // Resume the same consumer to model the next worker cycle after transport recovery.
  broken.emit=(screen,value)=>emitted.push({screen,...value});await due();await broken.tick();
  assert.equal(new Set(emitted.map(e=>e.screen)).size,4);assert.equal((await pending())[0],4);
});
