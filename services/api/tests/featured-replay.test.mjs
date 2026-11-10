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
const device='madar-demo-screen-token-only-1'; // public profile
const send=(method,u,data)=>admin[method](u).set('X-Madar-Request','1').send(data);
before(async()=>{
 assets=await mkdtemp(path.join(os.tmpdir(),'madar-replay-'));db=await openDatabase({memory:true});await seed(db,{demo:true});
 app=createApp({db,demo:true,assetsDir:assets});admin=request.agent(app);
 await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
});
after(async()=>{await db?.close();await rm(assets,{recursive:true,force:true})});

test('a featured replay banner (a video library video) is published to Replay only, for its profiles and period',async()=>{
 const {body:videos}=await admin.get('/api/admin/resources/videos?published=1');
 const programme=videos.find(r=>r.status==='published'&&r.visibleTo?.includes('public'));
 const {body:replays}=await admin.get('/api/admin/resources/replay?published=1');
 const catchup=replays.find(r=>r.status==='published');
 const base={title:'Discover Oman — Mountain Villages',description:'Explore the traditions and landscapes of Jebel Akhdar.',status:'published',placement:'replay',bannerLabel:'Featured Replay',ctaText:'Watch replay',sortOrder:0,visibleTo:['public'],screenGroups:['Main building'],startAt:new Date(Date.now()-3600e3).toISOString(),endAt:new Date(Date.now()+7*86400e3).toISOString()};
 await send('post','/api/admin/resources/featured',{payload:{...base,targetType:'video'}}).expect(422);
 await send('post','/api/admin/resources/featured',{payload:{...base,targetType:'channel',targetId:'x'}}).expect(422);
 await send('post','/api/admin/resources/featured',{payload:{...base,targetType:'video',targetId:'missing'}}).expect(422);
 const {body:created}=await send('post','/api/admin/resources/featured',{payload:{...base,targetType:'video',targetId:programme.id}});assert.ok(created.id);
 // Older banners that point at a catch-up programme still validate.
 await send('post','/api/admin/resources/featured',{payload:{...base,status:'draft',targetType:'replay',targetId:catchup.id}}).expect(201);
 await send('post','/api/admin/resources/featured',{payload:{...base,title:'Employees only',targetType:'video',targetId:programme.id,visibleTo:['employee']}});

 const {body:d}=await request(app).get('/api/app/sync').set('X-Screen-Key',device).expect(200);
 const bundle=JSON.parse(d.bundleText);
 const featured=bundle.content.featured.filter(f=>f.placement==='replay');
 assert.deepEqual(featured.map(f=>f.title),['Discover Oman — Mountain Villages']);
 assert.equal(featured[0].targetId,programme.id);assert.deepEqual(featured[0].screenGroups,['Main building']);
 assert.equal(featured[0].id,created.id);

 // Home banner sections never show Replay banners.
 const {body:home}=await request(app).get('/api/app/pages/home').set('X-Screen-Key',device).expect(200);
 const hero=home.sections.find(s=>s.type==='featured_banner');
 assert.ok(hero.data.length>0);assert.ok(!hero.data.some(x=>x.placement==='replay'));
 const {body:preview}=await admin.get('/api/admin/preview/home?profileId=public&mode=published').expect(200);
 assert.ok(!preview.sections.find(s=>s.type==='featured_banner').data.some(x=>x.placement==='replay'));
});

test('a replay programme needs a provider catch-up link or an uploaded recording to publish',async()=>{
 const {body:channels}=await admin.get('/api/admin/resources/channels?published=1');
 const base={title:'Evening news • Oman TV',status:'published',category:'News',visibleTo:['public'],channelId:channels[0].id,available:true,eventStart:new Date(Date.now()-26*3600e3).toISOString(),eventEnd:new Date(Date.now()-25*3600e3).toISOString()};
 await send('post','/api/admin/resources/replay',{payload:base}).expect(422);
 await send('post','/api/admin/resources/replay',{payload:{...base,videoRef:'DEMO_VOD_1'}}).expect(201);
 await send('post','/api/admin/resources/replay',{payload:{...base,status:'draft'}}).expect(201);
});
