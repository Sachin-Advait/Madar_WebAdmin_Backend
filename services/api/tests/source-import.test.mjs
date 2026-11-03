import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import request from './inject-driver.mjs';
import {openDatabase,one} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/seed.mjs';
import {parseSource,sourceUrl,xmltvDate,importedMediaUrl,planSourceImport} from '../src/source-import.mjs';

let db,app,admin;
const playlist=(title='News HD',url='https://headend.example/live/news.m3u8')=>`#EXTM3U\n#EXTINF:-1 tvg-id="news" tvg-chno="12" group-title="News",${title}\n${url}\n`;
const data=(text=playlist(),sourceId='headend')=>({sourceId,format:'m3u',text});
const post=(url,body)=>admin.post(url).set('X-Madar-Request','1').send(body);
async function apply(input){const {body:p}=await post('/api/admin/source-import/preview',input).expect(200);return (await post('/api/admin/source-import/apply',{...input,digest:p.digest}).expect(200)).body}
before(async()=>{db=await openDatabase({memory:true,url:''});await seed(db,{demo:true});app=createApp({db,demo:true});admin=request.agent(app);await admin.post('/api/auth/login').send({email:'admin@madar.local',password:'MadarDemo!2026#'}).expect(200)});
after(()=>db.close());

test('M3U import is draft-only, stable and idempotent; media stays server-side',async()=>{
  const input=data();const preview=(await post('/api/admin/source-import/preview',input).expect(200)).body;
  assert.equal(preview.counts.create,1);assert.ok(!JSON.stringify(preview).includes('headend.example'));
  assert.equal(preview.items[0].payload.number,12);assert.equal(preview.items[0].payload.epgId,'news');
  const first=await apply(input),id=first.ids[0].id,row=await one(db,"SELECT * FROM resources WHERE kind='channels' AND id=$1",[id]);
  assert.equal(row.draft.status,'draft');assert.equal(row.published,null);assert.equal(row.revision,1);
  assert.equal(await importedMediaUrl(db,row.draft.streamRef),'https://headend.example/live/news.m3u8');
  const again=await apply(input);assert.equal(again.created,0);assert.equal(again.updated,0);assert.equal(again.unchanged,1);assert.equal(again.ids[0].id,id);
  assert.equal((await one(db,"SELECT revision FROM resources WHERE kind='channels' AND id=$1",[id])).revision,1);
});

test('source refresh preserves operator changes, cached artwork, audience and published playback',async()=>{
  const first=await apply(data(playlist(),'preserve')),id=first.ids[0].id;
  let row=await one(db,"SELECT * FROM resources WHERE kind='channels' AND id=$1",[id]);
  const published={...row.draft,status:'published'};const operator={...published,title:'Local operator title',image:'/art/campus.svg',visibleTo:['employee'],bannerMode:'override',bannerTitle:'Our headline'};
  await db.query("UPDATE resources SET draft=$2,published=$3,revision=revision+1 WHERE kind='channels' AND id=$1",[id,JSON.stringify(operator),JSON.stringify(published)]);
  const result=await apply(data(playlist('Provider new name','https://headend.example/live/news-v2.m3u8'),'preserve'));
  assert.equal(result.updated,1);row=await one(db,"SELECT * FROM resources WHERE kind='channels' AND id=$1",[id]);
  assert.equal(row.draft.title,'Local operator title');assert.equal(row.draft.image,'/art/campus.svg');assert.equal(row.draft.bannerTitle,'Our headline');assert.deepEqual(row.draft.visibleTo,['employee']);assert.equal(row.draft.status,'draft');
  assert.equal(row.published.streamRef,published.streamRef);assert.notEqual(row.draft.streamRef,row.published.streamRef);
  assert.equal(await importedMediaUrl(db,row.published.streamRef),'https://headend.example/live/news.m3u8');
  assert.equal(await importedMediaUrl(db,row.draft.streamRef),'https://headend.example/live/news-v2.m3u8');
});

test('preview guards reject intervening operator edits and source changes atomically',async()=>{
  const input=data(playlist(),'guard');const {body:p}=await post('/api/admin/source-import/preview',input).expect(200);
  await post('/api/admin/source-import/apply',{...input,text:playlist('Different'),digest:p.digest}).expect(409);
  assert.equal(await one(db,'SELECT id FROM source_imports WHERE id=$1',['guard']),undefined);
  const first=await apply(input),id=first.ids[0].id;
  const changed=data(playlist('Refresh title'),'guard'),fresh=(await post('/api/admin/source-import/preview',changed).expect(200)).body;
  await db.query("UPDATE resources SET draft=jsonb_set(draft,'{title}','\"Changed concurrently\"'),revision=revision+1 WHERE kind='channels' AND id=$1",[id]);
  await post('/api/admin/source-import/apply',{...changed,digest:fresh.digest}).expect(409);
  assert.equal((await one(db,"SELECT draft FROM resources WHERE kind='channels' AND id=$1",[id])).draft.title,'Changed concurrently');
});

test('XMLTV maps source channel IDs and timezone-aware programme times without inventing replay',async()=>{
  await apply(data(playlist(),'guide'));
  const input={sourceId:'guide',format:'xmltv',text:'<?xml version="1.0" encoding="UTF-8"?><tv><channel id="news"><display-name>News</display-name></channel><programme channel="news" start="20261103110000 +0400" stop="20261103120000 +0400"><title lang="en">Morning &amp; News</title><title lang="ar">الأخبار</title><desc><![CDATA[Today <in brief>]]></desc><category>News</category></programme></tv>'};
  const r=await apply(input),id=r.ids[0].id,row=await one(db,"SELECT draft FROM resources WHERE kind='programmes' AND id=$1",[id]);
  assert.equal(row.draft.eventStart,'2026-11-03T07:00:00.000Z');assert.equal(row.draft.eventEnd,'2026-11-03T08:00:00.000Z');assert.equal(row.draft.title,'Morning & News');assert.equal(row.draft.description,'Today <in brief>');assert.ok(row.draft.channelId.startsWith('source-'));assert.equal(row.draft.replayId,undefined);
  const repeat=await apply(input);assert.equal(repeat.ids[0].id,id);assert.equal(repeat.unchanged,1);
  await post('/api/admin/source-import/preview',{...input,sourceId:'wrong-source'}).expect(422);
  assert.equal(xmltvDate('202611031100 -0530'),'2026-11-03T16:30:00.000Z');
  assert.throws(()=>xmltvDate('20260230120000 +0000'),/calendar/);
});

test('JSON creates actual replay only with explicit playback source and expiry; mixed import resolves channels',async()=>{
  const input={sourceId:'json-source',format:'json',text:JSON.stringify({items:[
    {kind:'replay',externalId:'morning-news',channelExternalId:'news',mediaUrl:'https://headend.example/recordings/news.mp4',payload:{title:'Morning replay',available:true,startAt:'2026-11-03T07:00:00Z',endAt:'2026-11-10T07:00:00Z'}},
    {kind:'channels',externalId:'news',mediaUrl:'https://headend.example/live/news.m3u8',payload:{title:'Live News'}}
  ]})};
  const result=await apply(input);assert.equal(result.created,2);
  const replay=await one(db,"SELECT draft,published FROM resources WHERE kind='replay' AND id=$1",[result.ids.find(i=>i.kind==='replay').id]);
  assert.equal(replay.draft.available,true);assert.equal(replay.published,null);assert.ok(await importedMediaUrl(db,replay.draft.providerRef));
  const bad=JSON.parse(input.text);delete bad.items[0].mediaUrl;await post('/api/admin/source-import/preview',{...input,text:JSON.stringify(bad)}).expect(422);
});

test('malformed, malicious and overlarge exports fail with no network or XML entities',async()=>{
  for(const url of ['file:///etc/passwd','http://example.com/a','udp://239.0.0.1:1234','https://user:password@example.com/x','https://127.1/x','https://169.254.169.254/x','https://[::1]/x','https://host/x\\y','https://host/x#token'])assert.throws(()=>sourceUrl(url),url);
  assert.equal(sourceUrl('https://192.168.20.10/live/news.m3u8'),'https://192.168.20.10/live/news.m3u8');
  const xmls=['<!DOCTYPE tv [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tv/>','<tv><programme><title>&xxe;</title></programme></tv>','<tv><programme channel="x" channel="y"/></tv>','<tv><programme></tv>','<tv>'+ '<x>'.repeat(14)+'</x>'.repeat(14)+'</tv>','<tv><programme channel="x" start="20261103120000" stop="20261103110000"><title>Bad</title></programme></tv>'];
  for(const text of xmls)assert.throws(()=>parseSource({sourceId:'invalid',format:'xmltv',text}));
  assert.throws(()=>parseSource(data(playlist()+playlist().split('\n').slice(1).join('\n'))),/Duplicate/);
  assert.throws(()=>parseSource(data('x'.repeat(750*1024+1))),/750/);
  assert.throws(()=>parseSource(data('#EXTM3U\n#EXTINF:-1,No ID\nhttps://example.com/a')),/tvg-id/);
  assert.throws(()=>parseSource({sourceId:'bad',format:'json',text:'[{"kind":"videos","externalId":"x","mediaUrl":"https://a.example/x","payload":{"title":"AA","customFields":{"__proto__":{}}}}]'}),/customFields/);
  assert.throws(()=>parseSource({sourceId:'bad',format:'json',text:'['.repeat(100)+'0'+']'.repeat(100)}),/deeply nested/);
});

test('source API requires admin and returns bounded public previews',async()=>{
  await request(app).post('/api/admin/source-import/preview').send(data()).expect(401);
  await post('/api/admin/users',{email:'source-editor@madar.local',name:'Source editor',role:'editor',password:'MadarDemo!2026#'}).expect(201);
  const editor=request.agent(app);await editor.post('/api/auth/login').send({email:'source-editor@madar.local',password:'MadarDemo!2026#'}).expect(200);
  await editor.post('/api/admin/source-import/preview').set('X-Madar-Request','1').send(data()).expect(403);
  const raw=await planSourceImport(db,data());assert.ok(raw.items.length<=500);assert.equal(raw.media.length,1);
});

test('retired draft URLs are pruned while every published reference remains available',async()=>{
  const sourceId='url-retention',first=await apply(data(playlist('Live News','https://media.example/one.m3u8'),sourceId)),id=first.ids[0].id;
  const original=(await one(db,"SELECT draft FROM resources WHERE kind='channels' AND id=$1",[id])).draft.streamRef;
  await apply(data(playlist('Live News','https://media.example/two.m3u8'),sourceId));
  assert.equal(await importedMediaUrl(db,original),undefined);
  let row=await one(db,"SELECT draft FROM resources WHERE kind='channels' AND id=$1",[id]);
  await db.query("UPDATE resources SET published=$2 WHERE kind='channels' AND id=$1",[id,JSON.stringify({...row.draft,status:'published'})]);const publishedRef=row.draft.streamRef;
  await apply(data(playlist('Live News','https://media.example/three.m3u8'),sourceId));
  assert.equal(await importedMediaUrl(db,publishedRef),'https://media.example/two.m3u8');
  assert.equal(Number((await one(db,'SELECT count(*) AS n FROM source_media WHERE source_id=$1',[sourceId])).n),2);
});

test('checked-in examples import as one coherent fictional headend chain',async()=>{
  let imported=0;
  for(const [name,format] of [['source-channels.m3u','m3u'],['source-guide.xml','xmltv'],['source-catalogue.json','json']]){
    const text=await readFile(new URL('../../../docs/examples/'+name,import.meta.url),'utf8');
    const result=await apply({sourceId:'example-headend',format,text});imported+=result.created;
  }
  assert.equal(imported,8);
});
