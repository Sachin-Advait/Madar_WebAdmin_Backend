import {isIP} from 'node:net';
import {isDeepStrictEqual} from 'node:util';
import {check,sha,validateResource,profileTypes} from './domain.mjs';
import {one,rows} from './db.mjs';
import {contentFields,extendedSchema,validateExtra} from './cms.mjs';

export const importLimits={bytes:750*1024,items:500,sourceRecords:100000,xmlDepth:12,xmlNodes:25000};
const kinds=new Set(['channels','videos','replay','radio','programmes']);
const safeId=value=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/.test(value);
const resourceId=(source,kind,id)=>'source-'+sha(JSON.stringify([source,kind,id])).slice(0,40);
const common={status:'draft',visibleTo:profileTypes};

export function sourceUrl(value){
  check(typeof value==='string'&&value.length<=4096&&!/[\s\\]/.test(value),422,'Source media requires a valid HTTPS URL');
  let url;try{url=new URL(value)}catch{check(false,422,'Source media requires a valid HTTPS URL')}
  check(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash,422,'Use HTTPS media without embedded credentials or fragments; UDP/RTP/HTTP needs an HTTPS media gateway');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  check(host&&!['localhost','0.0.0.0','::','::1','metadata.google.internal'].includes(host)&&!host.endsWith('.localhost')&&!/^127\.|^169\.254\.|^fe[89ab][0-9a-f]:|^ff[0-9a-f]{2}:|^::ffff:/i.test(host),422,'Loopback, link-local, multicast and metadata addresses are not valid sources');
  if(isIP(host)===4)check(Number(host.split('.')[0])<224,422,'Multicast sources require an HTTPS gateway');
  return url.href;
}

function decodeXml(value){
  const known={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return value.replace(/&([^;\s<&]+);|&/g,(match,entity)=>{
    check(entity,422,'Unescaped XML ampersand');
    if(Object.hasOwn(known,entity))return known[entity];
    check(/^#(?:\d+|x[0-9a-f]+)$/i.test(entity),422,'XML entities and external references are disabled');
    const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
    check(code===9||code===10||code===13||(code>=32&&code<=0xd7ff)||(code>=0xe000&&code<=0xfffd)||(code>=0x10000&&code<=0x10ffff),422,'Invalid XML character');
    return String.fromCodePoint(code);
  });
}

// A deliberately limited non-validating XMLTV reader. No DTD, entities, namespaces,
// network, external files, processing instructions (apart from declaration), or
// arbitrary object key assignment. Unsupported XML is rejected rather than guessed.
function xmlTree(input){
  let text=input.replace(/^\uFEFF/,'');
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text),422,'Invalid XML control character');
  text=text.replace(/^\s*<\?xml\s+[^?]*\?>/,'');
  check(!/<!(?!\[CDATA\[|--)|<\?/i.test(text),422,'XML declarations, DTDs and external entities are disabled');
  const root={name:'#document',attrs:{},children:[],text:''},stack=[root];let at=0,nodes=0;
  const token=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
  while(at<text.length){token.lastIndex=at;const match=token.exec(text);check(match,422,'Malformed or unsupported XML');const part=match[0];at=token.lastIndex;const parent=stack.at(-1);
    if(part.startsWith('<!--')){check(!part.slice(4,-3).includes('--'),422,'Invalid XML comment');continue}
    if(part.startsWith('<![CDATA[')){check(stack.length>1,422,'Text outside XML root');parent.text+=part.slice(9,-3);continue}
    if(part.startsWith('</')){const name=part.slice(2,-1).trim();check(stack.length>1&&parent.name===name,422,'Mismatched XML element');stack.pop();continue}
    if(part[0]==='<'){
      const name=/^<([A-Za-z][A-Za-z0-9_-]*)/.exec(part)[1];const attrs=Object.create(null);
      for(const m of part.matchAll(/\s+([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){check(!Object.hasOwn(attrs,m[1]),422,'Duplicate XML attribute');attrs[m[1]]=decodeXml(m[2]??m[3])}
      const child={name,attrs,children:[],text:''};parent.children.push(child);check(++nodes<=importLimits.xmlNodes,422,'Too many XML elements');
      if(!part.endsWith('/>')){stack.push(child);check(stack.length<=importLimits.xmlDepth,422,'XML nesting is too deep')}
    }else{check(!part.includes(']]>'),422,'Invalid XML text');parent.text+=decodeXml(part)}
  }
  check(stack.length===1&&root.children.length===1&&!root.text.trim()&&root.children[0].name==='tv',422,'XMLTV requires one complete tv root');return root.children[0];
}

export function xmltvDate(value){
  const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s+([+-])(\d{2})(\d{2}))?$/.exec(value||'');
  check(m,422,'XMLTV dates require YYYYMMDDhhmm[ss] with optional numeric timezone');
  const [,y,mo,d,h,mi,se='00',sign,oh='00',om='00']=m,numbers=[y,mo,d,h,mi,se].map(Number);
  check(Number(oh)<=14&&Number(om)<60&&!(Number(oh)===14&&Number(om)>0),422,'Invalid XMLTV timezone');
  const utc=Date.UTC(...[numbers[0],numbers[1]-1,...numbers.slice(2)]),v=new Date(utc);
  check(v.getUTCFullYear()===numbers[0]&&v.getUTCMonth()===numbers[1]-1&&v.getUTCDate()===numbers[2]&&v.getUTCHours()===numbers[3]&&v.getUTCMinutes()===numbers[4]&&v.getUTCSeconds()===numbers[5],422,'Invalid XMLTV calendar date');
  return new Date(utc-(sign==='-'?-1:1)*(Number(oh)*60+Number(om))*60000).toISOString();
}
const childText=(node,name,lang)=>node.children.find(c=>c.name===name&&(!lang||c.attrs.lang===lang))?.text.trim();

function parseM3u(text,warnings){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);check(lines[0]?.startsWith('#EXTM3U'),422,'Expected an extended M3U playlist');
  const records=[];let pending;
  for(const line of lines.slice(1)){
    if(line.startsWith('#EXTINF:')){
      check(!pending,422,'Each EXTINF entry requires one following media URL');
      const match=/^#EXTINF:\s*-?\d+(?:\.\d+)?((?:\s+[\w-]+="[^"]*")*)\s*,(.*)$/.exec(line);check(match,422,'Unsupported EXTINF entry; use quoted playlist attributes');
      const attributes=Object.create(null);for(const a of match[1].matchAll(/([\w-]+)="([^"]*)"/g)){check(!Object.hasOwn(attributes,a[1]),422,'Duplicate playlist attribute');attributes[a[1]]=a[2]}
      const externalId=attributes['tvg-id'];check(safeId(externalId),422,'Every channel needs a stable tvg-id to map the programme guide');
      const number=attributes['tvg-chno']||attributes['channel-number'];if(number)check(/^\d{1,6}$/.test(number),422,'Channel number must be a nonnegative integer');
      pending={kind:'channels',externalId,payload:{...common,title:match[2].trim()||attributes['tvg-name'],epgId:externalId,...(attributes['group-title']?{category:attributes['group-title']}:{}),...(number?{number:Number(number)}:{})},metadata:{}};
      if(attributes['tvg-logo']){pending.metadata.artworkUrl=sourceUrl(attributes['tvg-logo']);warnings.push(`Artwork for ${externalId} is recorded for review; upload the image before publication.`)}
      if(attributes.catchup||attributes['catchup-source'])warnings.push(`Catch-Up declarations for ${externalId} do not create playable recordings. Import explicit replay programmes with valid media URLs.`);
    }else if(line.startsWith('#'))continue;
    else{check(pending,422,'Media URL without an EXTINF entry');pending.url=sourceUrl(line);records.push(pending);pending=null;check(records.length<=importLimits.items,422,'Import at most 500 records at a time')}
  }
  check(!pending,422,'Playlist ends before a media URL');return records;
}
function parseXmltv(text,warnings){
  const root=xmlTree(text),records=[];
  check(root.children.every(c=>['channel','programme'].includes(c.name)),422,'Unsupported XMLTV root element');
  for(const node of root.children.filter(n=>n.name==='programme')){
    const channelExternalId=node.attrs.channel;check(safeId(channelExternalId),422,'XMLTV programme needs a channel ID');
    const eventStart=xmltvDate(node.attrs.start),eventEnd=xmltvDate(node.attrs.stop);check(eventEnd>eventStart,422,'Programme stop must follow start');
    const title=childText(node,'title','en')||childText(node,'title'),titleAr=childText(node,'title','ar');
    const externalId=node.attrs.id||`${channelExternalId}@${eventStart}`;check(safeId(externalId),422,'Programme ID is too long');
    const icon=node.children.find(c=>c.name==='icon')?.attrs.src;
    records.push({kind:'programmes',externalId,channelExternalId,payload:{...common,title,eventStart,eventEnd,...(titleAr?{titleAr}:{}),...(childText(node,'desc')?{description:childText(node,'desc')}:{}),...(childText(node,'category')?{category:childText(node,'category')}:{}),...(childText(node,'desc','ar')?{descriptionAr:childText(node,'desc','ar')}: {})},metadata:icon?{artworkUrl:sourceUrl(icon)}:{}});
  }
  if(root.children.some(n=>n.name==='channel'))warnings.push('XMLTV channel definitions map to channels already imported under this source ID; they do not create streams.');
  if(records.some(r=>r.metadata.artworkUrl))warnings.push('Programme artwork URLs are recorded for review. Upload artwork before publication.');
  return records;
}
function parseJson(text,warnings){
  let data;try{data=JSON.parse(text)}catch{check(false,422,'Invalid JSON export')}
  const pending=[{value:data,depth:0}];let nodes=0;
  while(pending.length){const {value,depth}=pending.pop();check(++nodes<=25000&&depth<=8,422,'JSON export is too deeply nested or complex');if(value&&typeof value==='object')for(const v of Object.values(value))pending.push({value:v,depth:depth+1})}
  const list=Array.isArray(data)?data:data?.items;check(Array.isArray(list),422,'JSON must be an array or {items:[...]}');
  return list.map(r=>{
    check(r&&typeof r==='object'&&!Array.isArray(r)&&kinds.has(r.kind)&&safeId(r.externalId),422,'JSON records need kind and stable externalId');
    check(r.payload&&typeof r.payload==='object'&&!Array.isArray(r.payload),422,'JSON records need a payload object');
    check(Object.keys(r).every(k=>['kind','externalId','channelExternalId','payload','mediaUrl','artworkUrl'].includes(k)),422,'Unsupported JSON import field');
    const p={...r.payload,...common};
    for(const f of ['streamRef','stationRef','providerRef','videoRef','channelId','replayId','image','landscapeImage','portraitImage','customFields','bannerMode','bannerTitle','bannerTitleAr','bannerDescription','bannerDescriptionAr','focalX','focalY'])check(p[f]===undefined,422,`${f} is managed in MADAR; use mediaUrl, artworkUrl or channelExternalId`);
    if(r.kind==='replay')check(r.mediaUrl&&p.available===true&&p.startAt&&p.endAt&&r.channelExternalId,422,'Replay imports require actual mediaUrl, available:true, channelExternalId and availability startAt/endAt');
    if(['channels','videos','radio'].includes(r.kind))check(r.mediaUrl,422,'Media imports require an HTTPS mediaUrl');
    if(['programmes','replay'].includes(r.kind))check(safeId(r.channelExternalId),422,'Programme/replay imports require channelExternalId');
    if(r.kind==='programmes')check(!r.mediaUrl,422,'EPG programmes are metadata; import an explicit replay record for playable media');
    if(r.artworkUrl)warnings.push(`Artwork for ${r.externalId} is recorded for review; upload it before publication.`);
    return {kind:r.kind,externalId:r.externalId,channelExternalId:r.channelExternalId,payload:p,...(r.mediaUrl?{url:sourceUrl(r.mediaUrl)}:{}),metadata:r.artworkUrl?{artworkUrl:sourceUrl(r.artworkUrl)}:{}};
  });
}
export function parseSource(input){
  check(input&&/^[a-z][a-z0-9-]{1,63}$/.test(input.sourceId),422,'Source ID must be a 2-64 character lowercase slug');
  check(['m3u','xmltv','json'].includes(input.format),422,'Choose m3u, xmltv or json');
  check(typeof input.text==='string'&&Buffer.byteLength(input.text)<=importLimits.bytes,422,'Import text must not exceed 750 KiB');
  const warnings=[],records=({m3u:parseM3u,xmltv:parseXmltv,json:parseJson}[input.format])(input.text,warnings);
  check(records.length>0&&records.length<=importLimits.items,422,'Import 1-500 media or programme records at a time');
  const keys=new Set();for(const r of records){const key=r.kind+'|'+r.externalId;check(!keys.has(key),422,'Duplicate source record ID in this import');keys.add(key)}
  return {records,warnings:[...new Set(warnings)]};
}
function mergeDraft(current,previous,incoming){
  if(!current)return structuredClone(incoming);
  const next=structuredClone(current);
  for(const key of new Set([...Object.keys(previous),...Object.keys(incoming)])){
    if(['status','visibleTo'].includes(key))continue;
    if(isDeepStrictEqual(current[key],previous[key])||current[key]===undefined){
      if(Object.hasOwn(incoming,key))next[key]=structuredClone(incoming[key]);else delete next[key];
    }
  }
  // This does not alter published. A changed source requires a fresh operator review.
  if(!isDeepStrictEqual(next,current))next.status='draft';
  return next;
}

export async function planSourceImport(db,input,{lock=false}={}){
  const {records,warnings}=parseSource(input),sourceId=input.sourceId;
  const relevantKeys=[...new Set(records.flatMap(r=>[r.kind+'|'+r.externalId,...(r.channelExternalId?['channels|'+r.channelExternalId]:[])]))];
  const bindings=await rows(db,"SELECT b.*,r.draft,r.revision FROM source_bindings b JOIN resources r ON r.kind=b.kind AND r.id=b.resource_id WHERE source_id=$1 AND (b.kind||'|'||b.external_id)=ANY($2::text[]) ORDER BY b.kind,b.external_id"+(lock?' FOR UPDATE OF r':''),[sourceId,relevantKeys]);
  const byKey=new Map(bindings.map(b=>[b.kind+'|'+b.external_id,b]));
  const channelIds=new Map(bindings.filter(b=>b.kind==='channels').map(b=>[b.external_id,b.resource_id]));
  for(const r of records.filter(r=>r.kind==='channels'))channelIds.set(r.externalId,byKey.get('channels|'+r.externalId)?.resource_id||resourceId(sourceId,'channels',r.externalId));
  const fieldsByKind=new Map();for(const kind of [...new Set(records.map(r=>r.kind))].sort())fieldsByKind.set(kind,await contentFields(db,kind));
  const items=[],media=[];
  for(const r of records){
    const binding=byKey.get(r.kind+'|'+r.externalId),id=binding?.resource_id||resourceId(sourceId,r.kind,r.externalId),incoming={...r.payload};
    if(r.channelExternalId){check(channelIds.has(r.channelExternalId),422,`Channel ${r.channelExternalId} has not been imported under source ${sourceId}`);incoming.channelId=channelIds.get(r.channelExternalId)}
    if(r.url){const reference='source-media:'+sha(JSON.stringify([sourceId,r.url]));incoming[{channels:'streamRef',videos:'videoRef',replay:'providerRef',radio:'stationRef'}[r.kind]||'providerRef']=reference;media.push({reference,url:r.url})}
    const p=mergeDraft(binding?.draft,binding?.last_imported||{},incoming),fields=fieldsByKind.get(r.kind);
    validateResource(r.kind,p,extendedSchema(r.kind,fields));validateExtra(fields,p);
    const action=!binding?'create':isDeepStrictEqual(p,binding.draft)?'unchanged':'update';
    items.push({externalId:r.externalId,kind:r.kind,resourceId:id,payload:p,action,incoming,metadata:r.metadata});
  }
  const fingerprint=bindings.map(b=>[b.kind,b.external_id,b.resource_id,b.revision,b.last_imported]);
  const digest=sha(JSON.stringify({sourceId,format:input.format,text:input.text,fingerprint,fields:[...fieldsByKind]}));
  return {sourceId,format:input.format,digest,counts:{total:items.length,create:items.filter(i=>i.action==='create').length,update:items.filter(i=>i.action==='update').length,unchanged:items.filter(i=>i.action==='unchanged').length},items,warnings,media};
}
export function publicImportPlan(plan){return {...plan,media:undefined,items:plan.items.map(({incoming,metadata,...i})=>{const payload={...i.payload};for(const key of ['streamRef','stationRef','providerRef','videoRef'])delete payload[key];return {...i,payload,...(metadata.artworkUrl?{artworkPending:true}:{})}})}}
export async function importedMediaUrl(db,reference){if(typeof reference!=='string'||!/^source-media:[a-f0-9]{64}$/.test(reference))return undefined;return (await one(db,'SELECT url FROM source_media WHERE reference=$1',[reference]))?.url}
