import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProfile,validateResource} from '../src/domain.mjs';
import {experienceDefaults,resolvedExperience,validateExperience} from '../src/experience-config.mjs';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';
import {releaseProfile} from '../src/releases.mjs';
const profile={id:'test',name:'Test profile',profileType:'public',theme:{accent:'#6b5837',mode:'light',language:'en'},allowedSections:['*']};
test('experience defaults protect public screens and support device orientation overrides',()=>{
 assert.equal(validateProfile(structuredClone(profile)).experience.historyMode,'off');
 assert.equal(experienceDefaults({profileType:'employee'}).historyMode,'device');
 const p={...profile,experience:{orientation:'landscape'}};
 assert.equal(resolvedExperience(p,{orientationOverride:'portrait'}).orientation,'portrait');
 assert.equal(resolvedExperience(p,{orientationOverride:'inherit'}).orientation,'landscape');
});
test('Info Hub has four tabs with fixed sections; admins rename and hide them',()=>{
 const e=experienceDefaults(profile);
 assert.deepEqual(e.hubGroups.map(g=>g.id),['live','news','services','work']);
 assert.deepEqual(e.hubGroups.find(g=>g.id==='work').pages,['info-work']);
 assert.throws(()=>validateExperience({...e,orientation:'rotate'},profile));
 assert.throws(()=>validateExperience({...e,completionThreshold:0.1},profile));
 assert.throws(()=>validateExperience({...e,historyMode:'all-users'},profile));
 // Titles and visibility are kept; sections cannot be moved between tabs.
 const edited=structuredClone(e.hubGroups);edited[3].title='Operations';edited[0].enabled=false;edited[1].pages=['info-work'];
 const saved=validateExperience({hubGroups:edited},profile).hubGroups;
 assert.equal(saved[3].title,'Operations');assert.equal(saved[0].enabled,false);
 assert.deepEqual(saved[1].pages,['info-notices','info-events','info-media']);
 assert.throws(()=>validateExperience({hubGroups:edited.map(g=>({...g,enabled:false}))},profile),/at least one/);
 assert.throws(()=>validateExperience({hubGroups:[...edited.slice(0,3),{...edited[3],id:'live'}]},profile),/once each/);
 assert.throws(()=>validateExperience({hubGroups:edited.map((g,i)=>i?g:{...g,title:''})},profile),/title/);
});
test('profiles saved with the old five-tab layout move to the four tabs',()=>{
 const old=[{id:'glance',title:'At a glance',titleAr:'',pages:['info-meetings','info-queue']},{id:'updates',title:'Updates',titleAr:'',pages:['info-notices','info-alerts']},{id:'services',title:'Services',titleAr:'',pages:['info-services','info-visitor']},{id:'explore',title:'Explore',titleAr:'',pages:['info-events','info-media']},{id:'management',title:'Management',titleAr:'',pages:['info-helpdesk','info-tasks']}];
 const r=resolvedExperience({...profile,experience:{hubGroups:old}});
 assert.deepEqual(r.hubGroups.map(g=>g.title),['Live Status','News & Events','Services & Guide','Work & Support']);
 assert.ok(r.hubGroups.every(g=>g.enabled));
 assert.deepEqual(validateExperience({hubGroups:old},profile).hubGroups.map(g=>g.id),['live','news','services','work']);
 // Work & Support is hidden when the profile allows neither Help Desk nor Daily Tasks.
 const limited=resolvedExperience({...profile,allowedSections:['home','info-hub','info-meetings']});
 assert.equal(limited.hubGroups.find(g=>g.id==='work').enabled,false);
 assert.equal(resolvedExperience({...profile,allowedSections:['info-tasks']}).hubGroups.find(g=>g.id==='work').enabled,true);
});
test('media artwork and focal points validate independently of orientation',()=>{
 const p={title:'A film',status:'draft',landscapeImage:'/art/horizon.svg',portraitImage:'/art/learning.svg',bannerMode:'override',focalX:0.7,focalY:0.3,tags:['nature','culture']};
 assert.equal(validateResource('videos',p).portraitImage,p.portraitImage);
 assert.throws(()=>validateResource('videos',{...p,focalX:2}));
 assert.throws(()=>validateResource('videos',{...p,portraitImage:'javascript:alert(1)'}));
 assert.throws(()=>validateResource('videos',{...p,tags:['nature','nature']}));
});
test('release permissions exclude hidden-page data; unverified banner publication rolls back',async()=>{
 const db=await openDatabase({memory:true,url:''});
 try{
  await seed(db,{demo:true});
  await db.tx(async tx=>{const p=(await one(tx,"SELECT payload FROM profiles WHERE id='public'")).payload;p.allowedSections=['home'];await tx.query("UPDATE profiles SET payload=$1 WHERE id='public'",[JSON.stringify(p)]);await releaseProfile(tx,'public','Permission test')});
  const b=(await one(db,"SELECT bundle FROM releases WHERE profile_id='public' ORDER BY version DESC LIMIT 1")).bundle;
  assert.equal(b.content.videos,undefined);assert.equal(b.content.meetings,undefined);assert.ok(b.content.featured.length);
  const app=createApp({db,demo:true}),admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);
  const video=await one(db,"SELECT * FROM resources WHERE kind='videos' AND id='sample-videos-1'");
  await admin.put('/api/admin/resources/videos/'+video.id).set('X-Madar-Request','1').send({payload:{...video.draft,landscapeImage:'https://example.com/unverified.jpg'},expectedRevision:video.revision}).expect(422);
  assert.equal((await one(db,"SELECT revision FROM resources WHERE kind='videos' AND id=$1",[video.id])).revision,video.revision);
  const screenKey='madar-demo-screen-token-only-2';
  await request(app).get('/api/app/playback/videos/sample-videos-1?mediaRevision=obsolete').set('X-Screen-Key',screenKey).expect(409);
  await request(app).get('/api/app/playback/replay/sample-replay-4').set('X-Screen-Key',screenKey).expect(404);
 }finally{await db.close()}
});
test('existing v3 publications upgrade once without publishing pending drafts',async()=>{
 const db=await openDatabase({memory:true,url:''});
 try{
  await seed(db,{demo:true});
  await db.query("UPDATE releases SET bundle=bundle-'experienceVersion'");
  await db.query("UPDATE resources SET draft=jsonb_set(draft,'{title}','\"Unapproved draft title\"') WHERE kind='videos' AND id='sample-videos-1'");
  await seed(db,{demo:false});
  const upgraded=await one(db,"SELECT bundle,version FROM releases WHERE profile_id='public' ORDER BY version DESC LIMIT 1");
  assert.equal(upgraded.bundle.experienceVersion,6);
  const video=upgraded.bundle.content.videos.find(r=>r.id==='sample-videos-1');
  assert.notEqual(video.title,'Unapproved draft title');assert.match(video.mediaRevision,/^[a-f0-9]{64}$/);
  await seed(db,{demo:false});
  assert.equal((await one(db,"SELECT max(version) AS version FROM releases WHERE profile_id='public'")).version,upgraded.version);
 }finally{await db.close()}
});
