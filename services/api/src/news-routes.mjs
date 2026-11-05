// Breaking news: fetch headlines from RSS/Atom feeds, publish the chosen ones,
// and serve them to the TV ticker. Ticker look and audience live in settings.
import {isIP} from 'node:net';
import {z} from 'zod';
import {one,rows} from './db.mjs';
import {uid,check,profileTypes} from './domain.mjs';
import {audit} from './releases.mjs';

const tickerDefaults={enabled:true,label:'Breaking News',labelAr:'عاجل',speed:'normal',profiles:[]};
const tickerSchema=z.object({
  enabled:z.boolean(),
  label:z.string().trim().max(40),
  labelAr:z.string().trim().max(40).default(''),
  speed:z.enum(['slow','normal','fast']),
  profiles:z.array(z.enum(profileTypes)).max(profileTypes.length).default([]),
}).strict();

export async function tickerSettings(db){return {...tickerDefaults,...((await one(db,"SELECT value FROM settings WHERE key='ticker'"))?.value||{})}}

/** Only public http(s) feed addresses; the server fetches these. */
export function feedUrl(value){
  let url;try{url=new URL(String(value||'').trim())}catch{check(false,422,'Enter a full feed address, for example https://news.example.com/rss')}
  check(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password,422,'Feed address must be http(s) without credentials');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  check(host&&!['localhost','0.0.0.0','::','::1','metadata.google.internal'].includes(host)&&!host.endsWith('.localhost')&&!/^127\.|^169\.254\.|^fe[89ab][0-9a-f]:|^::ffff:/i.test(host),422,'Loopback, link-local and metadata addresses are not allowed');
  if(isIP(host)===4)check(Number(host.split('.')[0])<224,422,'Multicast addresses are not feeds');
  url.hash='';return url.href;
}

const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function text(raw=''){
  let v=raw.trim();
  const cdata=v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if(cdata)v=cdata[1];
  v=v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ');
  v=v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>{if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}return entities[e.toLowerCase()]??m});
  return v.replace(/\s+/g,' ').trim();
}
const tag=(xml,name)=>xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,'i'))?.[1];

/** Parses RSS 2.0 / RSS 1.0 / Atom without DTDs or external entities. */
export function parseFeed(xml){
  check(typeof xml==='string'&&xml.length,422,'The feed is empty');
  check(!/<!DOCTYPE|<!ENTITY/i.test(xml),422,'Feeds with DTDs or entity declarations are not accepted');
  check(/<(rss|feed|rdf:RDF)[\s>]/i.test(xml),422,'This address did not return an RSS or Atom feed');
  const channel=tag(xml,'channel')||xml;
  const source=text(tag(channel.replace(/<(item|entry)[\s>][\s\S]*$/i,''),'title')||'');
  const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map(m=>m[2]).slice(0,100);
  const items=blocks.map(b=>{
    const title=text(tag(b,'title')||'');
    const link=text(tag(b,'link')||'')||b.match(/<link[^>]*href="([^"]+)"/i)?.[1]||'';
    const date=text(tag(b,'pubDate')||tag(b,'published')||tag(b,'updated')||tag(b,'date')||'');
    return {title:title.slice(0,300),link:/^https?:\/\//i.test(link)?link.slice(0,1000):'',publishedAt:Number.isNaN(Date.parse(date))?null:new Date(date).toISOString()};
  }).filter(i=>i.title);
  return {source:source.slice(0,120),items};
}

function reachReason(code){
  if(['ENOTFOUND','EAI_AGAIN'].includes(code))return 'the server name could not be found, check DNS or internet access';
  if(code==='ECONNREFUSED')return 'the server refused the connection';
  if(code==='ECONNRESET')return 'the server closed the connection';
  if(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code))return 'the connection timed out';
  if(['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return `the site's HTTPS certificate was not accepted, ${code}`;
  return '';
}

async function download(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    let r;
    try{r=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5','User-Agent':'Mozilla/5.0 (compatible; MADAR-News/4.0; +https://madar.local)'}})}
    catch(e){
      if(controller.signal.aborted)check(false,502,'The feed did not respond within 10 seconds');
      const code=e?.cause?.code||e?.code||'',reason=reachReason(code)||e?.cause?.message||e?.message||'';
      check(false,502,'Could not reach the feed address'+(reason?` (${reason}${code&&!reason.includes(code)?`, ${code}`:''})`:''));
    }
    check(r.ok,502,`The feed returned HTTP ${r.status}`);
    const reader=r.body.getReader(),chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;check(size<=2*1024*1024,413,'The feed is larger than 2 MB');chunks.push(value)}
    return Buffer.concat(chunks).toString('utf8');
  }finally{clearTimeout(timer)}
}

const itemView=r=>({id:r.id,title:r.title,source:r.source,link:r.link,sortOrder:r.sort_order,createdBy:r.created_by,createdAt:r.created_at,expiresAt:r.expires_at});
const activeItems=db=>rows(db,'SELECT * FROM news_items WHERE expires_at IS NULL OR expires_at>now() ORDER BY sort_order,created_at DESC LIMIT 100');

export function registerNewsRoutes(app,{db,admin,device,wrap,fetchFeed=download}){
  app.get('/api/admin/news/feeds',admin('viewer'),wrap(async(req,res)=>res.json((await rows(db,'SELECT * FROM news_feeds ORDER BY created_at DESC')).map(r=>({id:r.id,url:r.url,name:r.name,createdAt:r.created_at,lastFetchedAt:r.last_fetched_at})))));
  app.delete('/api/admin/news/feeds/:id',admin('editor'),wrap(async(req,res)=>{const r=await db.query('DELETE FROM news_feeds WHERE id=$1 RETURNING id',[req.params.id]);check(r.rows.length,404,'Feed not found');res.json({ok:true})}));

  // Fetch a feed for review. The address is remembered for next time.
  app.post('/api/admin/news/fetch',admin('editor'),wrap(async(req,res)=>{
    const url=feedUrl(z.object({url:z.string().max(2000)}).parse(req.body).url);
    const feed=parseFeed(await fetchFeed(url));
    await db.query('INSERT INTO news_feeds(id,url,name,last_fetched_at) VALUES($1,$2,$3,now()) ON CONFLICT(url) DO UPDATE SET name=EXCLUDED.name,last_fetched_at=now()',[uid(),url,feed.source]);
    res.json({url,...feed});
  }));

  app.get('/api/admin/news',admin('viewer'),wrap(async(req,res)=>res.json((await activeItems(db)).map(itemView))));

  // Publish headlines (from a feed or typed by hand). replace=true swaps the whole ticker.
  app.post('/api/admin/news/publish',admin('editor'),wrap(async(req,res)=>{
    const p=z.object({items:z.array(z.object({title:z.string().trim().min(1).max(300),source:z.string().trim().max(120).default(''),link:z.string().trim().max(1000).default('')}).strict()).min(1).max(100),replace:z.boolean().default(false),expiresAt:z.string().max(40).optional()}).strict().parse(req.body);
    if(p.expiresAt)check(!Number.isNaN(Date.parse(p.expiresAt)),422,'Expiry must be a valid date');
    const ids=await db.tx(async tx=>{
      if(p.replace)await tx.query('DELETE FROM news_items');
      const existing=new Set((await rows(tx,'SELECT title FROM news_items WHERE expires_at IS NULL OR expires_at>now()')).map(r=>r.title.toLowerCase()));
      const added=[];
      for(const [i,item] of p.items.entries()){
        if(existing.has(item.title.toLowerCase()))continue;existing.add(item.title.toLowerCase());
        const id=uid();added.push(id);
        await tx.query('INSERT INTO news_items(id,title,source,link,sort_order,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,item.title,item.source,/^https?:\/\//i.test(item.link)?item.link:'',i,req.user.email,p.expiresAt?new Date(p.expiresAt).toISOString():null]);
      }
      await audit(tx,req.user.email,'publish-news','news',added[0]||'none',{count:added.length,replace:p.replace});
      return added;
    });
    res.status(201).json({added:ids.length,skipped:p.items.length-ids.length});
  }));

  app.delete('/api/admin/news/:id',admin('editor'),wrap(async(req,res)=>{const r=await db.query('DELETE FROM news_items WHERE id=$1 RETURNING title',[req.params.id]);check(r.rows.length,404,'Headline not found');await audit(db,req.user.email,'remove-news','news',req.params.id,{title:r.rows[0].title});res.json({ok:true})}));
  app.delete('/api/admin/news',admin('editor'),wrap(async(req,res)=>{const r=await db.query('DELETE FROM news_items');await audit(db,req.user.email,'clear-news','news','all',{count:r.rowCount});res.json({removed:r.rowCount})}));

  app.get('/api/admin/news/settings',admin('viewer'),wrap(async(req,res)=>res.json(await tickerSettings(db))));
  app.put('/api/admin/news/settings',admin('admin'),wrap(async(req,res)=>{const p=tickerSchema.parse(req.body);await db.query("INSERT INTO settings(key,value) VALUES('ticker',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(p)]);await audit(db,req.user.email,'update-ticker','settings','ticker',p);res.json(p)}));

  // TV ticker: headlines for this screen's profile (empty when disabled or not targeted).
  app.get('/api/app/ticker',device,wrap(async(req,res)=>{
    const s=await tickerSettings(db),profile=await one(db,'SELECT payload FROM profiles WHERE id=$1',[req.screen.profile_id]);
    const allowed=s.enabled&&(!s.profiles.length||s.profiles.includes(profile?.payload?.profileType));
    res.json({enabled:allowed,label:s.label,labelAr:s.labelAr,speed:s.speed,items:allowed?(await activeItems(db)).map(r=>({id:r.id,title:r.title,source:r.source})):[]});
  }));
}
