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
test('hub grouping keeps all eight sections exactly once and validates layout policy',()=>{
 const e=experienceDefaults(profile);assert.equal(e.hubGroups.flatMap(g=>g.pages).length,10);
 assert.throws(()=>validateExperience({...e,orientation:'rotate'},profile));
 assert.throws(()=>validateExperience({...e,completionThreshold:0.1},profile));
 assert.throws(()=>validateExperience({...e,historyMode:'all-users'},profile));
 e.hubGroups[1].pages[0]=e.hubGroups[0].pages[0];assert.throws(()=>validateExperience(e,profile),/exactly once/);
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
  assert.equal(upgraded.bundle.experienceVersion,5);
  const video=upgraded.bundle.content.videos.find(r=>r.id==='sample-videos-1');
  assert.notEqual(video.title,'Unapproved draft title');assert.match(video.mediaRevision,/^[a-f0-9]{64}$/);
  await seed(db,{demo:false});
  assert.equal((await one(db,"SELECT max(version) AS version FROM releases WHERE profile_id='public'")).version,upgraded.version);
 }finally{await db.close()}
});
