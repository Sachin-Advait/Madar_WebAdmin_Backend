import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';

async function setup(){
 const db=await openDatabase({memory:true,url:''});
 await seed(db,{demo:true});
 const app=createApp({db,demo:true}),admin=request.agent(app);
 await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
 return {db,app,admin};
}

test('admin writes accept the admin’s own site and reject other origins',async()=>{
 const before=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://madar.example.org';
 const {db,admin}=await setup();
 try{
  // APP_ORIGIN differs from the host the admin was opened on (proxy / IP / other name): same host still passes.
  await admin.delete('/api/admin/enrollments/missing').set('X-Madar-Request','1').set('Host','gis.example.net').set('Origin','https://gis.example.net').expect(404);
  // APP_ORIGIN itself passes, also when listed with others.
  process.env.APP_ORIGIN='https://other.example, https://madar.example.org/';
  await admin.delete('/api/admin/enrollments/missing').set('X-Madar-Request','1').set('Origin','https://madar.example.org').expect(404);
  // Another site is still refused, and so is a write without the CSRF header.
  const {body}=await admin.delete('/api/admin/enrollments/missing').set('X-Madar-Request','1').set('Origin','https://evil.example').expect(403);
  assert.equal(body.detail,'Untrusted request origin');
  await admin.delete('/api/admin/enrollments/missing').set('Origin','https://madar.example.org').expect(403);
  await admin.delete('/api/admin/enrollments/missing').set('X-Madar-Request','1').set('Origin','null').expect(403);
 }finally{if(before===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=before;await db.close()}
});

test('a TV can cancel its own pairing code and admins can dismiss one',async()=>{
 const {db,app,admin}=await setup();
 try{
  const enroll=()=>request(app).post('/api/app/enroll').send({name:'TV',model:'m',platform:'p',appVersion:'1'}).expect(201).then(r=>r.body);
  const a=await enroll(),b=await enroll();
  let {body:list}=await admin.get('/api/admin/enrollments').expect(200);
  assert.deepEqual(list.map(x=>x.id).sort(),[a.id,b.id].sort());
  // Wrong proof cancels nothing.
  assert.equal((await request(app).delete('/api/app/enroll/'+a.id).set('X-Enrollment-Key','wrong').expect(200)).body.cancelled,false);
  assert.equal((await request(app).delete('/api/app/enroll/'+a.id).set('X-Enrollment-Key',a.enrollmentKey).expect(200)).body.cancelled,true);
  await admin.delete('/api/admin/enrollments/'+b.id).set('X-Madar-Request','1').expect(200);
  ({body:list}=await admin.get('/api/admin/enrollments').expect(200));
  assert.equal(list.length,0);
  assert.equal((await one(db,'SELECT status FROM enrollments WHERE id=$1',[a.id])).status,'cancelled');
  // A dismissed code can no longer be approved.
  await admin.post('/api/admin/enrollments/'+b.id+'/approve').set('X-Madar-Request','1').send({name:'TV',profileId:'public',location:'',groupName:'',assignedPage:'home',enabled:true}).expect(409);
  assert.equal((await request(app).get('/api/app/enroll/'+b.id).set('X-Enrollment-Key',b.enrollmentKey).expect(200)).body.status,'rejected');
 }finally{await db.close()}
});
