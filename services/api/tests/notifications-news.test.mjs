import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';
import {parseFeed,feedUrl} from '../src/news-routes.mjs';
import {mediaUrl} from '../src/source-import.mjs';

let db,app,admin,screenId;const key='madar-demo-screen-token-only-1';
const send=(url,body,method='post')=>admin[method](url).set('X-Madar-Request','1').send(body);
const tv=url=>request(app).get(url).set('X-Screen-Key',key);
before(async()=>{db=await openDatabase({memory:true,url:''});await seed(db,{demo:true});app=createApp({db,demo:true});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200);screenId=(await one(db,'SELECT id FROM screens LIMIT 1')).id});
after(()=>db.close());

test('notifications validate category, duration and screens',async()=>{
  await send('/api/admin/notifications',{title:'X',category:'PANIC',durationSeconds:10}).expect(422);
  await send('/api/admin/notifications',{title:'X',category:'INFO',durationSeconds:4}).expect(422);
  await send('/api/admin/notifications',{title:'X',category:'INFO',durationSeconds:121}).expect(422);
  await send('/api/admin/notifications',{title:'X',category:'INFO',durationSeconds:10,screenIds:['missing']}).expect(422);
  await request(app).post('/api/admin/notifications').send({title:'X',category:'INFO',durationSeconds:10}).expect(401);
});

test('a sent notification reaches targeted TVs until cancelled',async()=>{
  const {body:n}=await send('/api/admin/notifications',{title:'Fire drill',message:'Leave by the nearest exit',category:'EMERGENCY',durationSeconds:30,playSound:true,screenIds:[screenId]}).expect(201);
  assert.equal(n.status,'sent');assert.deepEqual(n.screenIds,[screenId]);
  let {body:live}=await tv('/api/app/notifications').expect(200);
  assert.equal(live.notifications[0].id,n.id);assert.equal(live.notifications[0].category,'EMERGENCY');assert.equal(live.notifications[0].playSound,true);
  await tv('/api/app/notifications').set('X-Screen-Key','wrong-key-that-is-long-enough').expect(401);
  await send(`/api/admin/notifications/${n.id}/cancel`,{}).expect(200);
  await send(`/api/admin/notifications/${n.id}/cancel`,{}).expect(409);
  ({body:live}=await tv('/api/app/notifications').expect(200));
  assert.ok(!live.notifications.some(x=>x.id===n.id));
  const {body:history}=await admin.get('/api/admin/notifications').expect(200);
  assert.equal(history.find(x=>x.id===n.id).status,'cancelled');
});

test('notifications can also be published as a Priority Alert',async()=>{
  const {body:n}=await send('/api/admin/notifications',{title:'Server maintenance',category:'WARNING',durationSeconds:15,addToPriorityAlerts:true}).expect(201);
  assert.ok(n.alertId);
  const alert=await one(db,"SELECT published FROM resources WHERE kind='alerts' AND id=$1",[n.alertId]);
  assert.equal(alert.published.severity,'warning');assert.equal(alert.published.status,'published');
  const {body:live}=await tv('/api/app/notifications');assert.ok(live.notifications.some(x=>x.id===n.id));
});

test('feed parsing handles RSS, Atom and CDATA but refuses DTDs',()=>{
  const rss=parseFeed('<?xml version="1.0"?><rss><channel><title>Daily &amp; News</title><item><title><![CDATA[Rain <b>expected</b>]]></title><link>https://n.example/1</link><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Road &#8211; closed</title></item></channel></rss>');
  assert.equal(rss.source,'Daily & News');assert.deepEqual(rss.items.map(i=>i.title),['Rain expected','Road – closed']);assert.equal(rss.items[0].link,'https://n.example/1');
  const atom=parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>First</title><link href="https://a.example/x"/><updated>2026-11-03T10:00:00Z</updated></entry></feed>');
  assert.equal(atom.items[0].link,'https://a.example/x');
  assert.throws(()=>parseFeed('<!DOCTYPE x [<!ENTITY a "b">]><rss></rss>'),/DTD/);
  assert.throws(()=>parseFeed('<html></html>'),/RSS or Atom/);
  for(const bad of ['file:///etc/passwd','http://127.0.0.1/rss','http://localhost/rss','http://169.254.169.254/latest','ftp://x.example/a'])assert.throws(()=>feedUrl(bad));
  assert.equal(feedUrl('https://news.example.com/rss#top'),'https://news.example.com/rss');
});

test('published headlines feed the TV ticker, skipping duplicates and honouring settings',async()=>{
  await send('/api/admin/news/publish',{items:[{title:'Headline one',source:'Desk'},{title:'Headline two'},{title:'headline ONE'}]}).expect(201).then(r=>assert.deepEqual(r.body,{added:2,skipped:1}));
  let {body:t}=await tv('/api/app/ticker').expect(200);
  assert.equal(t.enabled,true);assert.deepEqual(t.items.map(i=>i.title),['Headline one','Headline two']);
  await send('/api/admin/news/settings',{enabled:true,label:'Latest',labelAr:'',speed:'fast',profiles:['vip']},'put').expect(200);
  ({body:t}=await tv('/api/app/ticker'));assert.equal(t.enabled,false);assert.equal(t.items.length,0);
  await send('/api/admin/news/settings',{enabled:true,label:'Latest',labelAr:'',speed:'fast',profiles:[]},'put').expect(200);
  const {body:list}=await admin.get('/api/admin/news').expect(200);
  await admin.delete('/api/admin/news/'+list[0].id).set('X-Madar-Request','1').expect(200);
  ({body:t}=await tv('/api/app/ticker'));assert.equal(t.items.length,1);assert.equal(t.speed,'fast');
  await send('/api/admin/news/fetch',{url:'http://127.0.0.1/rss'}).expect(422);
});

test('channels accept direct and multicast stream URLs',async()=>{
  assert.equal(mediaUrl('udp://@239.1.1.1:1234'),'udp://@239.1.1.1:1234');
  assert.equal(mediaUrl('rtp://@239.10.0.5:5000'),'rtp://@239.10.0.5:5000');
  assert.equal(mediaUrl('http://10.0.0.5:8080/live/1.ts'),'http://10.0.0.5:8080/live/1.ts');
  for(const bad of ['udp://@239.1.1.1','file:///x','udp://127.0.0.1:1234','http://user:pw@10.0.0.1/a','javascript:alert(1)'])assert.throws(()=>mediaUrl(bad),bad);
  const payload={title:'Multicast News',status:'published',visibleTo:['public','employee','management','vip','signage'],streamRef:'udp://@239.1.1.1:1234'};
  const {body:c}=await send('/api/admin/resources/channels',{payload}).expect(201);
  await send('/api/admin/resources/channels',{payload:{...payload,title:'Bad',streamRef:'udp://@239.1.1.1'}}).expect(422);
  const {body:p}=await tv('/api/app/playback/channels/'+c.id).expect(200);
  assert.equal(p.url,'udp://@239.1.1.1:1234');
  const {body:missing}=await tv('/api/app/playback/channels/'+(await one(db,"SELECT id FROM resources WHERE kind='channels' AND published->>'streamRef' NOT LIKE '%://%' LIMIT 1")).id).expect(503);
  assert.match(missing.detail,/stream address/);
});
