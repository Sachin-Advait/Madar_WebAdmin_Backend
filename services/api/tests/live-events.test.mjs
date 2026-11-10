import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {createApp} from '../src/app.mjs';

let db,app,admin,assets;
before(async()=>{
 assets=await mkdtemp(path.join(os.tmpdir(),'madar-live-'));db=await openDatabase({memory:true});await seed(db,{demo:true});
 app=createApp({db,demo:true,assetsDir:assets});admin=request.agent(app);
 await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
});
after(async()=>{await db?.close();await rm(assets,{recursive:true,force:true})});

test('sending or cancelling a TV notification and changing the ticker announce a live update',async()=>{
 const seen=[];app.locals.events.on('live',k=>seen.push(k));
 const {body:n}=await admin.post('/api/admin/notifications').set('X-Madar-Request','1').send({title:'Fire drill',message:'Please leave by the east exit',category:'WARNING',durationSeconds:30,playSound:false,screenIds:[]}).expect(201);
 await admin.post('/api/admin/notifications/'+n.id+'/cancel').set('X-Madar-Request','1').send({}).expect(200);
 await admin.post('/api/admin/notifications/'+n.id+'/cancel').set('X-Madar-Request','1').send({}).expect(409);
 await admin.put('/api/admin/news/settings').set('X-Madar-Request','1').send({enabled:true,label:'Breaking News',labelAr:'عاجل',speed:'normal',profiles:[]});
 await new Promise(r=>setTimeout(r,300));const count=seen.length;
 await admin.get('/api/admin/notifications').expect(200);
 await admin.post('/api/admin/notifications/missing/cancel').set('X-Madar-Request','1').send({}).expect(409);
 assert.equal(seen.length,count,'failed and read-only requests announce nothing');
 assert.ok(seen.includes('notifications'));assert.ok(seen.includes('ticker'));
});
