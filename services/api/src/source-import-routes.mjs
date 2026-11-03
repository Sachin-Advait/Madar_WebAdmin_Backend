import {check} from './domain.mjs';
import {one} from './db.mjs';
import {audit} from './releases.mjs';
import {parseSource,planSourceImport,publicImportPlan,importLimits} from './source-import.mjs';

export function registerSourceImportRoutes(app,{db,admin,wrap,validateLinks}){
  app.post('/api/admin/source-import/preview',admin('admin'),wrap(async(req,res)=>res.json(publicImportPlan(await planSourceImport(db,req.body)))));
  app.post('/api/admin/source-import/apply',admin('admin'),wrap(async(req,res)=>{
    // Validate before opening a transaction. The same parser runs again under locks.
    const parsed=parseSource(req.body);check(/^[a-f0-9]{64}$/.test(req.body.digest||''),422,'Preview this import before applying it');
    const result=await db.tx(async tx=>{
      await tx.query('INSERT INTO source_imports(id) VALUES($1) ON CONFLICT DO NOTHING',[req.body.sourceId]);
      await tx.query('SELECT id FROM source_imports WHERE id=$1 FOR UPDATE',[req.body.sourceId]);
      for(const kind of [...new Set(parsed.records.map(r=>r.kind))].sort()){
        await tx.query('INSERT INTO content_types(kind) VALUES($1) ON CONFLICT DO NOTHING',[kind]);
        await tx.query('SELECT kind FROM content_types WHERE kind=$1 FOR UPDATE',[kind]);
      }
      const plan=await planSourceImport(tx,req.body,{lock:true});check(plan.digest===req.body.digest,409,'Import or content changed since preview. Preview again before applying.');
      const currentCount=Number((await one(tx,'SELECT count(*) AS n FROM source_bindings WHERE source_id=$1',[plan.sourceId])).n);
      check(currentCount+plan.counts.create<=importLimits.sourceRecords,422,'Source record limit reached. Delete obsolete guide/content records before importing more.');
      for(const m of plan.media)await tx.query('INSERT INTO source_media(reference,source_id,url) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[m.reference,plan.sourceId,m.url]);
      // Channels precede programmes/replay to validate newly created references.
      for(const item of [...plan.items].sort((a,b)=>(a.kind==='channels'?0:1)-(b.kind==='channels'?0:1))){
        if(item.action!=='unchanged'){
          await validateLinks(tx,item.kind,item.payload);
          if(item.action==='create')await tx.query('INSERT INTO resources(kind,id,draft) VALUES($1,$2,$3)',[item.kind,item.resourceId,JSON.stringify(item.payload)]);
          else await tx.query('UPDATE resources SET draft=$3,revision=revision+1,updated_at=now() WHERE kind=$1 AND id=$2',[item.kind,item.resourceId,JSON.stringify(item.payload)]);
        }
        await tx.query('INSERT INTO source_bindings(source_id,kind,external_id,resource_id,last_imported,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_id,kind,external_id) DO UPDATE SET last_imported=$5,metadata=$6',[plan.sourceId,item.kind,item.externalId,item.resourceId,JSON.stringify(item.incoming),JSON.stringify(item.metadata)]);
      }
      await tx.query('UPDATE source_imports SET updated_at=now() WHERE id=$1',[plan.sourceId]);
      // A changed URL has a new immutable ref. Keep any URL used by any current
      // draft or publication; retired URL versions need no unbounded history.
      await tx.query(`DELETE FROM source_media m WHERE m.source_id=$1 AND NOT EXISTS (
        SELECT 1 FROM resources r WHERE
        r.draft->>'streamRef'=m.reference OR r.draft->>'videoRef'=m.reference OR
        r.draft->>'stationRef'=m.reference OR r.draft->>'providerRef'=m.reference OR
        r.published->>'streamRef'=m.reference OR r.published->>'videoRef'=m.reference OR
        r.published->>'stationRef'=m.reference OR r.published->>'providerRef'=m.reference
      )`,[plan.sourceId]);
      await audit(tx,req.user.email,'source-import','source',plan.sourceId,{format:plan.format,count:plan.items.length,created:plan.counts.create,updated:plan.counts.update});
      return {created:plan.counts.create,updated:plan.counts.update,unchanged:plan.counts.unchanged,ids:plan.items.map(i=>({kind:i.kind,id:i.resourceId,externalId:i.externalId})),warnings:plan.warnings};
    });res.json(result);
  }));
}
