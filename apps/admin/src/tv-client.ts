import {openDB} from 'idb';
export const digest=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const database=()=>openDB('madar-tv-v2',1,{upgrade(db){db.createObjectStore('state');db.createObjectStore('assets')}});
const widgets=new Set(['featured_banner','live_channel_row','video_row','replay_channels','radio_row','meeting_summary','queue_summary','meeting_room_grid','meeting_schedule','queue_calling','queue_counters','announcements','events_row','services_grid','visitor_directory','media_highlights','priority_alerts','epg_guide','video_categories','info_links','helpdesk_summary','task_summary','task_list','work_helpdesk','work_tasks']);
export async function readCache(){const db=await database();const state=await db.get('state','active');if(!state||Date.now()-state.verifiedAt>24*3600000)return null;const urls:Record<string,string>={};for(const a of state.bundle.assets||[]){const blob=await db.get('assets',a.digest);if(!blob)return null;urls[a.url]=URL.createObjectURL(blob)}return {...state,urls}}
export async function clearCache(){const db=await database();const tx=db.transaction(['state','assets'],'readwrite');await tx.objectStore('state').clear();await tx.objectStore('assets').clear();await tx.done}
export async function stageRelease(delivery:any,key:string){
 if(await digest(new TextEncoder().encode(delivery.bundleText).buffer)!==delivery.digest)throw Error('Configuration integrity check failed');
 const bundle=JSON.parse(delivery.bundleText);if(bundle.schemaVersion!==1||bundle.releaseId!==delivery.releaseId)throw Error('Unsupported configuration version');
 for(const page of Object.values(bundle.pages) as any[])if(!Array.isArray(page.sections)||page.sections.some((s:any)=>!widgets.has(s.type)))throw Error('This release requires a newer TV renderer');
 const ack=async(stage:string)=>{const r=await fetch('/api/app/ack',{method:'POST',headers:{'X-Screen-Key':key,'Content-Type':'application/json'},body:JSON.stringify({deliveryId:delivery.deliveryId,stage,digest:delivery.digest})});if(!r.ok)throw Error((await r.json()).detail||'Acknowledgement rejected')};
 await ack('received');const db=await database(),blobs=new Map<string,Blob>(),urls:Record<string,string>={};let total=0;
 for(const asset of bundle.assets){total+=asset.bytes;if(total>300*1024*1024)throw Error('Release exceeds the 300 MB TV cache limit');let blob=await db.get('assets',asset.digest);if(!blob){const r=await fetch(asset.url,{headers:{'X-Screen-Key':key}});if(!r.ok)throw Error('Asset download failed');blob=await r.blob()}if(await digest(await blob.arrayBuffer())!==asset.digest)throw Error('Media integrity check failed');blobs.set(asset.digest,blob);urls[asset.url]=URL.createObjectURL(blob)}
 const state={bundle,delivery,verifiedAt:Date.now()};const tx=db.transaction(['state','assets'],'readwrite');await tx.objectStore('assets').clear();for(const [id,blob] of blobs)await tx.objectStore('assets').put(blob,id);await tx.objectStore('state').put(state,'active');await tx.done;
 await ack('downloaded');return {...state,urls,ackApplied:()=>ack('applied')};
}
