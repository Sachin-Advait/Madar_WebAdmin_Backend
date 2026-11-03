import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {z} from 'zod';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {registerPreferenceRoutes} from '../src/preference-routes.mjs';
import {playbackRevision,preferencePolicy,rankRecommendations,purgeExpiredPreferences} from '../src/preferences.mjs';

let db,app,bundle;
const profile={id:'staff',name:'Staff',profileType:'employee',allowedSections:['*'],experience:{historyMode:'device',recommendations:true,completionThreshold:.95}};
const publicProfile={...profile,id:'public',profileType:'public',experience:{}};
const media=(id,category='Science',extra={})=>({id,title:id,category,language:'en',sortOrder:0,status:'published',visibleTo:['employee','public'],videoRef:'provider:'+id,mediaRevision:playbackRevision({videoRef:'provider:'+id}),...extra});
const call=(method,url,body,screen='s1')=>{const r=request(app)[method](url).set('X-Test-Screen',screen);return body?r.send(body):r};
const start=(id='one',screen='s1',epoch=0)=>call('post','/api/app/playback-sessions',{kind:'videos',id,mediaRevision:bundle.content.videos.find(p=>p.id===id).mediaRevision},screen).set('X-Preferences-Epoch',String(epoch));
const put=(session,sequence,positionSeconds=30,event='checkpoint',screen='s1')=>call('put','/api/app/playback-sessions/'+session,{sequence,positionSeconds,durationSeconds:100,event},screen);
before(async()=>{
 db=await openDatabase({memory:true,url:''});
 app=express();app.use(express.json());
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 const device=wrap(async(req,res,next)=>{req.screen=await one(db,'SELECT * FROM screens WHERE id=$1',[req.get('X-Test-Screen')||'']);if(!req.screen?.enabled)return res.status(401).json({detail:'Unauthorized'});next()});
 const admin=role=>(req,res,next)=>{if(req.get('X-Test-Role')!=='admin'&&(role==='admin'||req.get('X-Test-Role')!=='viewer'))return res.status(403).json({detail:'Forbidden'});req.user={email:'admin@test',role:req.get('X-Test-Role')};next()};
 registerPreferenceRoutes(app,{db,device,admin,wrap});app.use((e,req,res,next)=>res.status(e instanceof z.ZodError?422:e.status||500).json({detail:e.message}));
});
beforeEach(async()=>{
 await db.exec('DELETE FROM playback_sessions; DELETE FROM device_progress; DELETE FROM favourites; DELETE FROM screens; DELETE FROM releases; DELETE FROM resources; DELETE FROM profiles;');
 for(const p of [profile,publicProfile])await db.query('INSERT INTO profiles(id,payload) VALUES($1,$2)',[p.id,JSON.stringify(p)]);
 bundle={profile,pages:{videos:{},replay:{}},content:{videos:[media('one'),media('two'),media('three','Sport',{featured:true}),media('expired','Science',{endAt:'2000-01-01T00:00:00Z'})],replay:[media('replay','Culture',{available:false})]}};
 for(const [kind,list]of Object.entries(bundle.content))for(const item of list)await db.query('INSERT INTO resources(kind,id,draft,published) VALUES($1,$2,$3,$3)',[kind,item.id,JSON.stringify(item)]);
 for(const [id,p]of [['rel',profile],['rel-public',publicProfile]]){const b={...bundle,profile:p};await db.query('INSERT INTO releases(id,profile_id,version,bundle,bundle_text,digest,reason) VALUES($1,$2,1,$3,$4,$5,$6)',[id,p.id,JSON.stringify(b),JSON.stringify(b),'test','test'])}
 for(const [id,p,rel]of [['s1','staff','rel'],['s2','staff','rel'],['public','public','rel-public']])await db.query('INSERT INTO screens(id,payload,profile_id,token_hash,desired_release) VALUES($1,$2,$3,$1,$4)',[id,'{}',p,rel]);
});
after(()=>db.close());

test('media revision is tied to playback source and manual revision, not titles or artwork',()=>{
 assert.equal(playbackRevision({videoRef:'a',title:'Old',image:'one'}),playbackRevision({videoRef:'a',title:'New',image:'two'}));
 assert.notEqual(playbackRevision({videoRef:'a'}),playbackRevision({videoRef:'b'}));
 assert.notEqual(playbackRevision({videoRef:'a'}),playbackRevision({videoRef:'a',mediaRevision:'2'}));
 assert.equal(preferencePolicy(publicProfile).historyMode,'off');assert.equal(preferencePolicy({profileType:'management'}).historyMode,'device');
});
test('server-issued sessions resume and reject stale sequence and superseded playback',async()=>{
 const a=(await start().expect(201)).body;assert.equal(a.progress,null);assert.equal(a.sessionVersion,1);
 await put(a.sessionId,1,20).expect(200);await put(a.sessionId,3,40).expect(200);
 assert.equal((await put(a.sessionId,3,40).expect(200)).body.duplicate,true);
 await put(a.sessionId,3,50).expect(409);await put(a.sessionId,2,25).expect(409);
 const b=(await start().expect(201)).body;assert.equal(b.progress.positionSeconds,40);assert.equal(b.sessionVersion,2);
 await put(a.sessionId,4,50).expect(409);await put(b.sessionId,1,10).expect(200);
 const prefs=(await call('get','/api/app/preferences').expect(200)).body;assert.equal(prefs.progress[0].positionSeconds,10);
});
test('history is isolated per device and untrusted session IDs cannot be updated elsewhere',async()=>{
 const a=(await start().expect(201)).body;await put(a.sessionId,1,30).expect(200);
 assert.deepEqual((await call('get','/api/app/preferences',null,'s2').expect(200)).body.progress,[]);
 await put(a.sessionId,2,40,'checkpoint','s2').expect(410);
 await call('get','/api/app/preferences',null,'').expect(401);
 await db.query('UPDATE screens SET enabled=false WHERE id=$1',['s1']);await put(a.sessionId,2,40).expect(401);
});
test('public and session modes never persist viewing history and privacy change purges previous progress',async()=>{
 const pub=(await start('one','public').expect(200)).body;assert.equal(pub.tracking,false);assert.equal(pub.sessionId,null);
 const a=(await start().expect(201)).body;await put(a.sessionId,1).expect(200);
 await db.query('UPDATE profiles SET payload=$2 WHERE id=$1',['staff',JSON.stringify({...profile,experience:{historyMode:'session'}})]);
 const prefs=(await call('get','/api/app/preferences').expect(200)).body;assert.equal(prefs.policy.historyMode,'session');assert.deepEqual(prefs.progress,[]);
 assert.equal((await one(db,'SELECT count(*)::integer AS n FROM device_progress')).n,0);
 assert.equal((await one(db,'SELECT count(*)::integer AS n FROM playback_sessions')).n,0);
 assert.equal((await start().expect(200)).body.tracking,false);await put(a.sessionId,2).expect(409);
});
test('expired, unavailable and restricted content cannot resume or influence suggestions',async()=>{
 await start('expired').expect(404);
 await call('post','/api/app/playback-sessions',{kind:'replay',id:'replay',mediaRevision:bundle.content.replay[0].mediaRevision}).expect(404);
 const a=(await start().expect(201)).body;await put(a.sessionId,1).expect(200);
 await db.query('UPDATE profiles SET payload=$2 WHERE id=$1',['staff',JSON.stringify({...profile,allowedSections:['home']})]);
 await start().expect(404);assert.deepEqual((await call('get','/api/app/preferences').expect(200)).body.progress,[]);
 assert.deepEqual((await call('get','/api/app/recommendations').expect(200)).body.items,[]);
});
test('replacement media filters old progress and an expired session cannot overwrite anything',async()=>{
 const a=(await start().expect(201)).body;await put(a.sessionId,1).expect(200);
 bundle.content.videos[0].mediaRevision=playbackRevision({videoRef:'replacement'});await db.query('UPDATE releases SET bundle=$2 WHERE id=$1',['rel',JSON.stringify(bundle)]);
 assert.deepEqual((await call('get','/api/app/preferences').expect(200)).body.progress,[]);await put(a.sessionId,2).expect(409);
 const b=(await start().expect(201)).body;assert.equal(b.progress,null);
 await db.query("UPDATE playback_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[b.sessionId]);await put(b.sessionId,1).expect(410);
});
test('completion, start-over and invalid checkpoints are handled without seek-based watch inflation',async()=>{
 const a=(await start().expect(201)).body;await put(a.sessionId,1,95).expect(200);
 assert.equal((await call('get','/api/app/preferences')).body.progress[0].completed,true);
 await put(a.sessionId,2,0).expect(200);assert.equal((await call('get','/api/app/preferences')).body.progress[0].completed,false);
 await put(a.sessionId,3,500).expect(422);
 await call('put','/api/app/playback-sessions/'+a.sessionId,{sequence:3,positionSeconds:0,durationSeconds:0,event:'pause'}).expect(422);
 await put(a.sessionId,3,90).expect(200);assert.ok(Number((await one(db,'SELECT watched_seconds FROM device_progress WHERE screen_id=$1',['s1'])).watched_seconds)<5);
});
test('device reset removes progress, recommendations inputs and favourites and fences old retries',async()=>{
 const a=(await start().expect(201)).body;assert.equal(a.epoch,0);await put(a.sessionId,1).expect(200);
 await db.query("INSERT INTO favourites(screen_id,kind,resource_id) VALUES('s1','videos','one')");
 await call('delete','/api/app/preferences').expect(200);await put(a.sessionId,2).expect(410);
 assert.equal((await one(db,'SELECT count(*)::integer AS n FROM favourites')).n,0);
 const prefs=(await call('get','/api/app/preferences')).body;assert.deepEqual(prefs.progress,[]);assert.equal(prefs.epoch,1);
 await start().expect(409);
 await call('post','/api/app/playback-sessions',{kind:'videos',id:'one',mediaRevision:bundle.content.videos[0].mediaRevision}).expect(409);
 assert.equal((await start('one','s1',1).expect(201)).body.epoch,1);
 assert.equal((await call('get','/api/app/preferences',null,'public')).body.epoch,0);
 assert.equal((await call('get','/api/app/preferences',null,'public')).body.epoch,0);
});
test('recommendations learn only local favourites, explain ranking and use editorial cold start without tracking',async()=>{
 const cold=(await call('get','/api/app/recommendations').expect(200)).body;assert.equal(cold.personalized,false);assert.equal(cold.items[0].id,'three');
 await db.query("INSERT INTO favourites(screen_id,kind,resource_id) VALUES('s1','videos','one')");
 const learned=(await call('get','/api/app/recommendations').expect(200)).body;assert.equal(learned.personalized,true);assert.equal(learned.items[0].id,'two');assert.match(learned.items[0].reason,/Science/);
 assert.ok(!learned.items.some(i=>['expired','replay'].includes(i.id)));assert.equal((await call('get','/api/app/recommendations',null,'s2')).body.personalized,false);
 await db.query("INSERT INTO favourites(screen_id,kind,resource_id) VALUES('public','videos','one')");assert.equal((await call('get','/api/app/recommendations',null,'public')).body.personalized,false);
 await call('get','/api/app/recommendations?limit=500').expect(422);
 const context={profile,bundle,policy:{historyMode:'device',recommendations:false}};assert.deepEqual(rankRecommendations(context).items,[]);
});
test('retention is bounded and admin summary and reset require the correct role',async()=>{
 const a=(await start().expect(201)).body;await put(a.sessionId,1).expect(200);
 await request(app).get('/api/admin/recommendation-summary').expect(403);
 const r=(await request(app).get('/api/admin/recommendation-summary').set('X-Test-Role','viewer').expect(200)).body;
 assert.equal(r.stored.progressItems,1);assert.equal(r.devices.off,1);assert.equal(r.externalAi,false);assert.equal(r.progress,undefined);
 await request(app).delete('/api/admin/screens/s1/preferences').set('X-Test-Role','viewer').expect(403);
 await request(app).delete('/api/admin/screens/s1/preferences').set('X-Test-Role','admin').expect(200);await put(a.sessionId,2).expect(410);
 const b=(await start('one','s1',1).expect(201)).body;await put(b.sessionId,1).expect(200);
 await db.query("UPDATE device_progress SET updated_at=now()-interval '91 days'");await db.query("UPDATE playback_sessions SET expires_at=now()-interval '1 second'");
 assert.deepEqual(await purgeExpiredPreferences(db,1),{sessions:1,progress:1});
});
