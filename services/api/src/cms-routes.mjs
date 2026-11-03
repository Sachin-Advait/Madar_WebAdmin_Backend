import {checkPreferenceEpoch} from './preferences.mjs';
import {one,rows} from './db.mjs';
import {catalog,uid,check,validateResource,allowedPage,activeAt} from './domain.mjs';
import {audit,releaseAll} from './releases.mjs';
import {masterSchemas,dynamicCatalog,parseFields,extendedSchema,contentFields,validateExtra,validateMaster,visibleItem,listFavourites,contentPage} from './cms.mjs';

export function registerCmsRoutes(app,{db,admin,device,wrap,validateLinks}){
 app.get('/api/admin/content-types',admin('viewer'),wrap(async(req,res)=>res.json((await dynamicCatalog(db)).fieldDefinitions)));
 app.put('/api/admin/content-types/:kind',admin('admin'),wrap(async(req,res)=>{
  const kind=req.params.kind,fields=parseFields(req.body.fields);check(catalog.resources[kind],404,'Unknown section');
  await db.tx(async tx=>{
   // Serialize schema changes against content writes on the same kind.
   await tx.query('INSERT INTO content_types(kind) VALUES($1) ON CONFLICT DO NOTHING',[kind]);
   const current=await one(tx,'SELECT * FROM content_types WHERE kind=$1 FOR UPDATE',[kind]);
   check(req.body.expectedRevision===current.revision,409,'Field definition changed; reload first');
   for(const r of await rows(tx,'SELECT draft,published FROM resources WHERE kind=$1',[kind]))for(const p of [r.draft,r.published].filter(Boolean)){try{validateResource(kind,p,extendedSchema(kind,fields));validateExtra(fields,p)}catch{check(false,409,'Existing content does not satisfy these fields. Make new fields optional and preserve fields already in use.')}}
   await tx.query('UPDATE content_types SET fields=$2,revision=revision+1,updated_at=now() WHERE kind=$1',[kind,JSON.stringify(fields)]);
   await releaseAll(tx,'Content field definitions updated');await audit(tx,req.user.email,'update-fields','content-type',kind);
  });res.json((await dynamicCatalog(db)).fieldDefinitions[kind]);
 }));
 app.get('/api/admin/masters/:kind',admin('viewer'),wrap(async(req,res)=>{check(masterSchemas[req.params.kind],404,'Unknown master');res.json((await rows(db,'SELECT * FROM masters WHERE kind=$1 ORDER BY payload->>\'name\'',[req.params.kind])).map(r=>({...r.payload,id:r.id,revision:r.revision})))}));
 async function namedReference(tx,row){
  const {kind,payload:p}=row;
  if(['groups','locations'].includes(kind)){
   const field=kind==='groups'?'groupName':'location';
   if((await rows(tx,'SELECT payload FROM screens')).some(r=>r.payload[field]===p.name))return true;
   if(kind==='groups'&&(await rows(tx,'SELECT payload FROM schedules')).some(r=>r.payload.groupName===p.name))return true;
  }
  if(kind==='buildings'&&(await rows(tx,"SELECT payload FROM masters WHERE kind='locations'")).some(r=>r.payload.building===p.name))return true;
  const fields={categories:['category'],departments:['owner','department'],buildings:['building'],languages:['language']}[kind];
  if(!fields)return false;
  return (await rows(tx,'SELECT kind,draft,published FROM resources')).some(r=>(kind!=='categories'||!p.resourceKind||r.kind===p.resourceKind)&&[r.draft,r.published].filter(Boolean).some(v=>fields.some(k=>v[k]===(kind==='languages'?p.code:p.name))));
 }
 async function saveMaster(req,res){
  const kind=req.params.kind,p=validateMaster(kind,req.body.payload),id=req.params.id||uid();
  await db.tx(async tx=>{
   const current=await one(tx,'SELECT * FROM masters WHERE kind=$1 AND id=$2 FOR UPDATE',[kind,id]);
   if(req.params.id)check(current,404,'Master item not found');
   if(current){
    check(req.body.expectedRevision===current.revision,409,'Master item changed; reload first');
    if((kind==='languages'?p.code!==current.payload.code:p.name!==current.payload.name))check(!await namedReference(tx,current),409,'This value is in use. Update its linked names or codes before renaming it.');
   }
   if(p.locationId)check(await one(tx,"SELECT id FROM masters WHERE kind='locations' AND id=$1 FOR SHARE",[p.locationId]),422,'Location not found');
   if(kind==='locations'&&p.building)check(await one(tx,"SELECT id FROM masters WHERE kind='buildings' AND payload->>'name'=$1 FOR SHARE",[p.building]),422,'Choose a registered building');
   await tx.query('INSERT INTO masters(kind,id,payload) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET payload=$3,revision=masters.revision+1,updated_at=now()',[kind,id,JSON.stringify(p)]);
   await releaseAll(tx,'Master data updated');await audit(tx,req.user.email,'save-master',kind,id);
  });res.status(req.params.id?200:201).json({id});
 }
 app.post('/api/admin/masters/:kind',admin('admin'),wrap(saveMaster));app.put('/api/admin/masters/:kind/:id',admin('admin'),wrap(saveMaster));
 app.delete('/api/admin/masters/:kind/:id',admin('admin'),wrap(async(req,res)=>{
  await db.tx(async tx=>{
   const r=await one(tx,'SELECT * FROM masters WHERE kind=$1 AND id=$2 FOR UPDATE',[req.params.kind,req.params.id]);check(r,404,'Master item not found');
   const resources=await rows(tx,'SELECT draft,published FROM resources');
   check(!resources.some(x=>[x.draft,x.published].filter(Boolean).some(p=>Object.values(p).includes(r.id)))&&!await namedReference(tx,r),409,'This master is in use. Deactivate it or update linked records first.');
   check(!(await rows(tx,'SELECT payload FROM masters WHERE id<>$1',[r.id])).some(x=>x.payload.locationId===r.id),409,'Location is used by rooms or counters');
   await tx.query('DELETE FROM masters WHERE kind=$1 AND id=$2',[r.kind,r.id]);await releaseAll(tx,'Master item removed');await audit(tx,req.user.email,'delete-master',r.kind,r.id);
  });res.json({ok:true});
 }));
 app.post('/api/admin/resources/:kind/import',admin('editor'),wrap(async(req,res)=>{const kind=req.params.kind,items=req.body.items;check(Array.isArray(items)&&items.length>0&&items.length<=100,422,'Import 1–100 JSON objects');const imported=await db.tx(async tx=>{await tx.query('INSERT INTO content_types(kind) VALUES($1) ON CONFLICT DO NOTHING',[kind]);await tx.query('SELECT kind FROM content_types WHERE kind=$1 FOR UPDATE',[kind]);const fields=await contentFields(tx,kind),schema=extendedSchema(kind,fields);const result=[];for(const item of items){const p=validateResource(kind,item,schema);validateExtra(fields,p);check(req.user.role==='admin'||!['published','disabled'].includes(p.status),403,'Editors may import drafts or review items');await validateLinks(tx,kind,p);const id=uid();await tx.query('INSERT INTO resources(kind,id,draft,published) VALUES($1,$2,$3,$4)',[kind,id,JSON.stringify(p),['published','disabled'].includes(p.status)?JSON.stringify(p):null]);result.push(id)}if(items.some(p=>['published','disabled'].includes(p.status)))await releaseAll(tx,'Content imported');await audit(tx,req.user.email,'import',kind,'batch',{count:result.length});return result});res.status(201).json({count:imported.length,ids:imported})}));
 app.get('/api/app/favourites',device,wrap(async(req,res)=>res.json(await listFavourites(db,req.screen))));
 app.put('/api/app/favourites/:kind/:id',device,wrap(async(req,res)=>{await db.tx(async tx=>{const screen=await one(tx,'SELECT * FROM screens WHERE id=$1 FOR UPDATE',[req.screen.id]);check(screen?.enabled,401,'Screen has been revoked');checkPreferenceEpoch(screen,req.get('X-Preferences-Epoch'));check(await visibleItem(tx,screen,req.params.kind,req.params.id),404,'Content is unavailable to this screen');const exists=await one(tx,'SELECT 1 FROM favourites WHERE screen_id=$1 AND kind=$2 AND resource_id=$3',[req.screen.id,req.params.kind,req.params.id]);if(!exists)check(Number((await one(tx,'SELECT count(*) AS n FROM favourites WHERE screen_id=$1',[req.screen.id])).n)<200,422,'A screen can save up to 200 favourites');await tx.query('INSERT INTO favourites(screen_id,kind,resource_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.screen.id,req.params.kind,req.params.id])});res.json({ok:true})}));
 app.delete('/api/app/favourites/:kind/:id',device,wrap(async(req,res)=>{await db.tx(async tx=>{const screen=await one(tx,'SELECT * FROM screens WHERE id=$1 FOR UPDATE',[req.screen.id]);check(screen?.enabled,401,'Screen has been revoked');checkPreferenceEpoch(screen,req.get('X-Preferences-Epoch'));await tx.query('DELETE FROM favourites WHERE screen_id=$1 AND kind=$2 AND resource_id=$3',[req.screen.id,req.params.kind,req.params.id])});res.json({ok:true})}));
 app.get('/api/app/catalog',device,wrap(async(req,res)=>{const r=await one(db,'SELECT bundle FROM releases WHERE id=$1',[req.screen.desired_release]);res.json({schemaVersion:1,pages:r?.bundle.pages,displayFields:r?.bundle.displayFields,masters:r?.bundle.masters})}));
 app.get('/api/app/content/:kind',device,wrap(async(req,res)=>{check(catalog.resources[req.params.kind],404,'Unknown content');const rel=await one(db,'SELECT bundle FROM releases WHERE id=$1',[req.screen.desired_release]);const b=rel?.bundle;res.json(b&&allowedPage(b.profile,contentPage[req.params.kind])?(b.content[req.params.kind]||[]).filter(r=>activeAt(r)):[])}));
}
