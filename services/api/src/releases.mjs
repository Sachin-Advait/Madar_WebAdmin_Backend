import {one,rows} from './db.mjs';
import {uid,sha,check,allowedPage,catalog} from './domain.mjs';
import {dynamicCatalog,contentPage} from './cms.mjs';
import {playbackRevision} from './preferences.mjs';
import {resolvedExperience} from './experience-config.mjs';
import {odooSettings,odooPageAllowed} from './odoo.mjs';
import {HUB_LAYOUT_PAGE,applyHubLayout} from './hub-layout.mjs';
/**
 * TV experience settings with the published Info Hub layout from the Page
 * Builder applied (tab contents, order and panel titles). Without a published
 * Info Hub layout the settings are returned unchanged.
 */
export async function hubExperience(db,profile,experience,odoo){
 if(!allowedPage(profile,'info-hub'))return experience;
 const l=await one(db,'SELECT published FROM layouts WHERE page_key=$1 AND profile_id=$2',[HUB_LAYOUT_PAGE,profile.id]);
 if(!l?.published)return experience;
 odoo??=await odooSettings(db);
 return applyHubLayout(experience,l.published,page=>allowedPage(profile,page)&&odooPageAllowed(odoo,profile.profileType,page)).experience;
}
export const audit=(db,actor,action,entity,id,detail={})=>db.query('INSERT INTO audit(actor,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[actor,action,entity,id,JSON.stringify(detail)]);
export async function queueDevice(db,screenId,releaseId){
 await db.query('SELECT id FROM screens WHERE id=$1 FOR UPDATE',[screenId]);
 await db.query("UPDATE deliveries SET status='superseded',updated_at=now() WHERE screen_id=$1 AND release_id<>$2 AND status<>'superseded'",[screenId,releaseId]);
 await db.query('UPDATE screens SET desired_release=$2 WHERE id=$1',[screenId,releaseId]);
 await db.query("INSERT INTO deliveries(id,screen_id,release_id) VALUES($1,$2,$3) ON CONFLICT(screen_id,release_id) DO UPDATE SET status='pending',next_attempt=now(),last_error=NULL,stream_id=NULL,stream_enqueued_at=NULL",[uid(),screenId,releaseId]);
}
export async function releaseProfile(db,profileId,reason){
 const pr=await one(db,'SELECT * FROM profiles WHERE id=$1 FOR UPDATE',[profileId]);check(pr,404,'Profile not found');const profile={...pr.payload,experience:resolvedExperience(pr.payload)};
 const odoo=await odooSettings(db);
 const pages={};let hubLayout=null;for(const l of await rows(db,'SELECT * FROM layouts WHERE profile_id=$1 AND published IS NOT NULL ORDER BY page_key',[profileId])){if(l.page_key===HUB_LAYOUT_PAGE){hubLayout=l.published;continue}if(allowedPage(profile,l.page_key)&&odooPageAllowed(odoo,profile.profileType,l.page_key))pages[l.page_key]=l.published}
 // The Page Builder's Info Hub layout sets the tabs' sections and titles, and which parts Work & Support shows.
 if(hubLayout&&allowedPage(profile,'info-hub')){const hub=applyHubLayout(profile.experience,hubLayout,page=>allowedPage(profile,page)&&odooPageAllowed(odoo,profile.profileType,page));profile.experience=hub.experience;if(hub.workPage)pages['info-work']=hub.workPage}
 const content={};const assetIds=new Set(),artworkIds=new Set();const definitions=(await dynamicCatalog(db)).fieldDefinitions;
 for(const row of await rows(db,'SELECT kind,id,published,created_at,updated_at FROM resources WHERE published IS NOT NULL ORDER BY kind,id')){
   const p=row.published;if(p.status!=='published'||!p.visibleTo?.includes(profile.profileType)||!allowedPage(profile,row.kind==='featured'&&p.placement==='replay'?'replay':contentPage[row.kind]))continue;
   for(const field of ['image','landscapeImage','portraitImage'])check(!p[field]||!/^https:/i.test(p[field]),422,'Upload artwork before publication so TVs can verify and cache it');
   for(const field of ['image','landscapeImage','portraitImage'])if(p[field]?.startsWith('/api/assets/'))artworkIds.add(p[field].split('/').pop());
   const safe={...p,id:row.id,createdAt:row.created_at,updatedAt:row.updated_at};if(['videos','replay'].includes(row.kind))safe.mediaRevision=playbackRevision(p);for(const k of ['streamRef','stationRef','providerRef','videoRef'])delete safe[k];
   if(safe.customFields)safe.customFields=Object.fromEntries(Object.entries(safe.customFields).filter(([k])=>definitions[row.kind]?.fields.some(f=>f.key===k&&f.showOnTv)));
   if(row.kind==='meetings'&&['public','vip','signage'].includes(profile.profileType)){safe.title=p.publicTitle||'Reserved';safe.titleAr='محجوز';delete safe.description;delete safe.descriptionAr;delete safe.organizer;delete safe.customFields;}
   const mediaRef=p.videoRef||p.stationRef;if(mediaRef?.startsWith('/api/assets/'))safe.mediaAssetId=mediaRef.split('/').pop();
   (content[row.kind]??=[]).push(safe);
   for(const v of Object.values(p))if(typeof v==='string'&&v.startsWith('/api/assets/'))assetIds.add(v.split('/').pop());
 }
 const assets=[];for(const id of assetIds){const a=await one(db,'SELECT id,mime,bytes,digest FROM assets WHERE id=$1',[id]);check(a,422,'Referenced asset not found');check(!artworkIds.has(id)||a.mime.startsWith('image/'),422,'Banner artwork must be an uploaded image');assets.push({...a,bytes:Number(a.bytes),url:'/api/assets/'+id})}
 check(assets.reduce((total,a)=>total+a.bytes,0)<=300*1024*1024,422,'Published profile exceeds the TV 300 MB offline cache limit');
 const latest=await one(db,'SELECT COALESCE(MAX(version),0) AS version FROM releases WHERE profile_id=$1',[profileId]);
 const version=Number(latest.version)+1,id=uid();
 const schedules=(await rows(db,'SELECT id,payload FROM schedules ORDER BY id')).map(r=>({...r.payload,id:r.id}));
 const masters=Object.groupBy((await rows(db,'SELECT kind,id,payload FROM masters ORDER BY kind,id')).filter(r=>r.payload.active).map(r=>({...r.payload,id:r.id,kind:r.kind})),r=>r.kind);
 const displayFields=Object.fromEntries(Object.entries(definitions).map(([k,d])=>[k,d.fields.filter(f=>f.showOnTv)]));
 const bundle={schemaVersion:1,experienceVersion:6,releaseId:id,version,profile,pages,content,assets,schedules,masters,displayFields,widgetSources:Object.fromEntries(Object.entries(catalog.widgets).map(([k,v])=>[k,v.source])),pageTitles:catalog.pages,createdAt:new Date().toISOString()};const text=JSON.stringify(bundle),digest=sha(text);
 await db.query('INSERT INTO releases(id,profile_id,version,bundle,bundle_text,digest,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,profileId,version,text,text,digest,reason]);
 for(const screen of await rows(db,'SELECT id FROM screens WHERE profile_id=$1 AND enabled=true ORDER BY id',[profileId]))await queueDevice(db,screen.id,id);
 return {id,version,digest};
}
export async function releaseAll(db,reason){const result=[];for(const p of await rows(db,'SELECT id FROM profiles ORDER BY id'))result.push(await releaseProfile(db,p.id,reason));return result}
export async function acknowledge(db,screenId,input){
 const {deliveryId,stage,digest,error}=input;check(['received','downloaded','applied','failed'].includes(stage),422,'Invalid acknowledgement stage');
 return db.tx(async tx=>{
   const screen=await one(tx,'SELECT * FROM screens WHERE id=$1 FOR UPDATE',[screenId]);
   const d=await one(tx,'SELECT d.*,r.digest FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE d.id=$1 AND d.screen_id=$2 FOR UPDATE OF d',[deliveryId,screenId]);
   check(d,404,'Delivery not found');check(screen.enabled,401,'Device revoked');check(d.release_id===screen.desired_release&&d.status!=='superseded',409,'This delivery has been superseded');check(digest===d.digest,422,'Release digest does not match');
   if(d.status==='applied')return {ok:true,duplicate:true,status:'applied'};
   const rank={pending:0,failed:0,received:1,downloaded:2,applied:3};
   if(stage!=='failed'&&rank[stage]<rank[d.status])return {ok:true,duplicate:true,status:d.status};
   if(stage==='applied')check(d.status==='downloaded',409,'Download verification must precede applied acknowledgement');
   if(stage==='downloaded')check(['received','downloaded'].includes(d.status),409,'Receipt must precede download acknowledgement');
   await tx.query('INSERT INTO acknowledgements(id,delivery_id,stage,digest) VALUES($1,$2,$3,$4) ON CONFLICT(delivery_id,stage) DO NOTHING',[uid(),deliveryId,stage,digest]);
   await tx.query('UPDATE deliveries SET status=$2,last_error=$3,updated_at=now() WHERE id=$1',[deliveryId,stage,stage==='failed'?String(error||'Device rejected update').slice(0,500):null]);
   if(stage==='applied')await tx.query('UPDATE screens SET applied_release=$2 WHERE id=$1',[screenId,d.release_id]);
   return {ok:true,status:stage};
 });
}
export async function dispatchDue(db,emit){
 const due=await db.tx(async tx=>{
   const ds=await rows(tx,"SELECT d.* FROM deliveries d JOIN screens s ON s.id=d.screen_id WHERE s.enabled=true AND s.desired_release=d.release_id AND d.status IN ('pending','received','downloaded','failed') AND d.next_attempt<=now() ORDER BY d.next_attempt LIMIT 100 FOR UPDATE OF d SKIP LOCKED");
   for(const d of ds)await tx.query("UPDATE deliveries SET attempts=attempts+1,next_attempt=now()+($2 * interval '1 second'),updated_at=now() WHERE id=$1",[d.id,Math.min(300,5*2**Math.min(d.attempts,6))]);
   return ds;
 });
 for(const d of due)emit(d.screen_id,{deliveryId:d.id,releaseId:d.release_id});
 return due.length;
}
