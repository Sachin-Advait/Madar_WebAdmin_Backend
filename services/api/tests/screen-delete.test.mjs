import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';

test('admins delete a screen; its key stops working and its records go with it',async()=>{
 const db=await openDatabase({memory:true,url:''});
 try{
  await seed(db,{demo:true});
  const app=createApp({db,demo:true}),admin=request.agent(app);
  await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
  const key='madar-demo-screen-token-only-2';
  const screen=(await request(app).get('/api/app/config').set('X-Screen-Key',key).expect(200)).body.screenId;
  // Give the screen a favourite, a delivery and a schedule of its own.
  await request(app).put('/api/app/favourites/videos/sample-videos-1').set('X-Screen-Key',key).expect(200);
  await db.query("INSERT INTO schedules(id,payload) VALUES('only-this-screen',$1)",[JSON.stringify({name:'Mornings',pageKey:'home',screenId:screen,daysOfWeek:[1],startTime:'08:00',endTime:'09:00',timeZone:'Asia/Muscat',priority:1,enabled:true})]);
  assert.ok((await one(db,'SELECT count(*)::int AS n FROM deliveries WHERE screen_id=$1',[screen])).n>0);
  await admin.delete('/api/admin/screens/'+screen).expect(403);// needs the CSRF header
  const {body}=await admin.delete('/api/admin/screens/'+screen).set('X-Madar-Request','1').expect(200);
  assert.deepEqual(body,{ok:true,schedules:1});
  assert.equal(await one(db,'SELECT id FROM screens WHERE id=$1',[screen]),undefined);
  for(const table of ['deliveries','favourites','media_tickets'])assert.equal((await one(db,`SELECT count(*)::int AS n FROM ${table} WHERE screen_id=$1`,[screen])).n,0,table);
  assert.equal(await one(db,"SELECT id FROM schedules WHERE id='only-this-screen'"),undefined);
  await request(app).get('/api/app/config').set('X-Screen-Key',key).expect(401);
  const audit=await one(db,"SELECT detail FROM audit WHERE action='delete-screen' ORDER BY id DESC LIMIT 1");assert.equal(audit.detail.schedulesRemoved,1);
  await admin.delete('/api/admin/screens/'+screen).set('X-Madar-Request','1').expect(404);
  const {body:list}=await admin.get('/api/admin/screens').expect(200);assert.ok(!list.some(s=>s.id===screen));
 }finally{await db.close()}
});
