import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {createApp} from '../src/app.mjs';
import {catalog} from '../src/domain.mjs';
import {applyHubLayout,defaultHubLayout} from '../src/hub-layout.mjs';
import {withAllHubGroups} from '../src/experience-config.mjs';

let db,app,admin,editor,assets;
const device='madar-demo-screen-token-only-2'; // management profile
const url='/api/admin/layouts/info_hub?profileId=management';
const login=(agent,email)=>agent.post('/api/auth/login').send({email,password:'MadarDemo!2026#'}).expect(200);
const send=(agent,method,u,data)=>agent[method](u).set('X-Madar-Request','1').send(data);
before(async()=>{
 assets=await mkdtemp(path.join(os.tmpdir(),'madar-hub-'));db=await openDatabase({memory:true});await seed(db,{demo:true});
 app=createApp({db,demo:true,assetsDir:assets});admin=request.agent(app);editor=request.agent(app);
 await login(admin,'admin@madar.local');
 await send(admin,'post','/api/admin/users',{email:'editor@madar.local',name:'editor',role:'editor',password:'MadarDemo!2026#'}).expect(201);
 await login(editor,'editor@madar.local');
});
after(async()=>{await db?.close();await rm(assets,{recursive:true,force:true})});

test('the Info Hub layout starts with all ten sections and is not a TV page',async()=>{
 const {body:l}=await admin.get(url).expect(200);
 assert.equal(l.pageKey,'info_hub');assert.equal(l.publishedVersion,1);
 assert.deepEqual(l.draft.sections.map(s=>s.type),defaultHubLayout().sections.map(s=>s.type));
 assert.equal(catalog.pages.info_hub,undefined);
 const {body:v}=await admin.get('/api/admin/layouts/info_hub/versions?profileId=management').expect(200);
 assert.equal(v[0].version,1);
 await admin.get('/api/admin/layouts/info_hub?profileId=missing').expect(404);
});

test('Info Hub drafts are validated, versioned and published to TVs',async()=>{
 const {body:l}=await admin.get(url);
 const bad=structuredClone(l.draft);bad.sections[0].type='video_row';
 await send(admin,'put',url,{layout:bad,expectedRevision:l.revision}).expect(422);
 const tooLong=structuredClone(l.draft);tooLong.sections[0].props.title='x'.repeat(200);
 await send(admin,'put',url,{layout:tooLong,expectedRevision:l.revision}).expect(422);

 // Hide the queue, rename and move Meeting Rooms after the alerts, drop Tasks.
 const s=structuredClone(l.draft.sections);
 const by=t=>s.find(x=>x.type===t);
 by('hub_queue_management').enabled=false;
 Object.assign(by('hub_meeting_rooms').props,{title:'Boardrooms',subtitle:'Level 3',badge:'Live'});
 const draft={...l.draft,sections:[by('hub_priority_alerts'),by('hub_meeting_rooms'),...s.filter(x=>!['hub_priority_alerts','hub_meeting_rooms','hub_task_summary'].includes(x.type))]};
 const {body:saved}=await send(admin,'put',url,{layout:draft,expectedRevision:l.revision}).expect(200);
 await send(admin,'put',url,{layout:draft,expectedRevision:l.revision}).expect(409);
 const {body:again}=await admin.get(url);
 assert.equal(again.draft.sections.length,9);
 assert.equal(again.published.sections.length,10,'saving a draft leaves TVs unchanged');

 const {body:pub}=await send(admin,'post','/api/admin/layouts/info_hub/publish?profileId=management',{expectedRevision:saved.revision}).expect(200);
 assert.equal(pub.publishedVersion,2);

 const {body:config}=await request(app).get('/api/app/config').set('X-Screen-Key',device).expect(200);
 const live=config.experience.hubGroups.find(g=>g.id==='live');
 assert.deepEqual(live.pages,['info-meetings']);assert.deepEqual(live.banners,['info-alerts']);
 assert.equal(config.experience.hubPanels['info-meetings'].title,'Boardrooms');
 assert.equal(config.experience.hubPanels['info-meetings'].badge,'Live');
 assert.equal(config.experience.hubPanels['info-queue'],undefined);

 const {body:d}=await request(app).get('/api/app/sync').set('X-Screen-Key',device).expect(200);
 const bundle=JSON.parse(d.bundleText);
 assert.equal(bundle.pages.info_hub,undefined);
 assert.deepEqual(bundle.profile.experience.hubGroups.find(g=>g.id==='live').pages,['info-meetings']);
 assert.deepEqual(bundle.pages['info-work'].sections.map(x=>x.type),['work_helpdesk']);
 assert.equal(bundle.pages['info-work'].sections[0].layout.w,12);
 const {body:work}=await request(app).get('/api/app/pages/info-work').set('X-Screen-Key',device).expect(200);
 assert.deepEqual(work.sections.map(x=>x.source),['helpdesk']);

 const {body:versions}=await admin.get('/api/admin/layouts/info_hub/versions?profileId=management');
 assert.deepEqual(versions.map(v=>v.version),[2,1]);
 const {body:now}=await admin.get(url);
 await send(admin,'post','/api/admin/layouts/info_hub/rollback?profileId=management',{version:1,expectedRevision:now.revision}).expect(200);
 const {body:restored}=await admin.get(url);
 assert.equal(restored.draft.sections.length,10);assert.equal(restored.publishedVersion,2);
});

test('only admins publish the Info Hub layout',async()=>{
 const {body:l}=await admin.get('/api/admin/layouts/info_hub?profileId=public');
 await send(editor,'post','/api/admin/layouts/info_hub/publish?profileId=public',{expectedRevision:l.revision}).expect(403);
});

test('applyHubLayout keeps tab titles, filters pages the profile cannot show and empties hidden tabs',()=>{
 const groups=withAllHubGroups([{id:'news',title:'Updates',enabled:true}]);
 const layout=defaultHubLayout();
 for(const s of layout.sections)if(s.type.startsWith('hub_official')||s.type.startsWith('hub_events')||s.type.startsWith('hub_media'))s.enabled=false;
 const {experience,workPage}=applyHubLayout({hubGroups:groups},layout,page=>page!=='info-tasks');
 const news=experience.hubGroups.find(g=>g.id==='news');
 assert.equal(news.title,'Updates');assert.deepEqual(news.pages,[]);assert.equal(news.builder,true);
 assert.deepEqual(workPage.sections.map(s=>s.type),['work_helpdesk']);
 assert.deepEqual(experience.hubGroups.find(g=>g.id==='work').pages,['info-work']);
});
