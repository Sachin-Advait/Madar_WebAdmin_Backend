// Removes the sample content that MADAR_DEMO=1 seeds into a database:
// demo channels/videos/notices/etc., the four demo screens (whose keys are
// public in the source code), and demo master data. Your own content,
// screens, users, layouts and profiles are not touched. Languages are kept.
//
//   Dry run (shows what would be removed):
//     node --env-file=.env scripts/remove-demo-data.mjs
//   Remove it:
//     node --env-file=.env scripts/remove-demo-data.mjs --apply
//
// Set MADAR_DEMO=0 in .env first, or the server will add sample data again.
import {openDatabase,rows} from '../services/api/src/db.mjs';
import {seed} from '../services/api/src/seed.mjs';
import {releaseAll,audit} from '../services/api/src/releases.mjs';

const apply=process.argv.includes('--apply');
if(!process.env.DATABASE_URL&&!process.env.PGLITE_PATH)console.warn('DATABASE_URL is not set: using the local development database ./data/dev-postgres');

// Work out exactly which rows demo mode adds by seeding two throwaway databases.
async function seededKeys(demo){
  const db=await openDatabase({memory:true,url:''});
  try{
    await seed(db,{demo,password:'remove-demo-data-temporary'});
    return {
      resources:(await rows(db,'SELECT kind,id FROM resources')).map(r=>r.kind+'\u0000'+r.id),
      masters:(await rows(db,'SELECT kind,id FROM masters')).map(r=>r.kind+'\u0000'+r.id),
      screens:(await rows(db,'SELECT id FROM screens')).map(r=>r.id),
    };
  }finally{await db.close()}
}
const [withDemo,without]=await Promise.all([seededKeys(true),seededKeys(false)]);
const only=(a,b)=>a.filter(x=>!new Set(b).has(x));
const demoResources=only(withDemo.resources,without.resources).map(k=>k.split('\u0000'));
const demoMasters=only(withDemo.masters,without.masters).map(k=>k.split('\u0000')).filter(([kind])=>kind!=='languages');
const demoScreens=only(withDemo.screens,without.screens);

const db=await openDatabase();
try{
  const pick=async(sql,keys)=>keys.length?rows(db,sql,[keys.map(k=>k[0]),keys.map(k=>k[1])]):[];
  const foundResources=await pick('SELECT r.kind,r.id,coalesce(r.published,r.draft)->>\'title\' AS title FROM resources r JOIN unnest($1::text[],$2::text[]) AS k(kind,id) ON r.kind=k.kind AND r.id=k.id',demoResources);
  const foundMasters=await pick('SELECT m.kind,m.id,m.payload->>\'name\' AS name FROM masters m JOIN unnest($1::text[],$2::text[]) AS k(kind,id) ON m.kind=k.kind AND m.id=k.id',demoMasters);
  const foundScreens=await rows(db,'SELECT id,payload->>\'name\' AS name FROM screens WHERE id = ANY($1::text[])',[demoScreens]);
  console.log(`Demo content items: ${foundResources.length}`);
  for(const r of foundResources)console.log(`  ${r.kind.padEnd(13)} ${r.id.padEnd(22)} ${r.title||''}`);
  console.log(`Demo screens (public test keys): ${foundScreens.length}`);
  for(const s of foundScreens)console.log(`  ${s.id.padEnd(22)} ${s.name||''}`);
  console.log(`Demo master records: ${foundMasters.length}`);
  for(const m of foundMasters)console.log(`  ${m.kind.padEnd(13)} ${m.id.padEnd(22)} ${m.name||''}`);
  if(!foundResources.length&&!foundScreens.length&&!foundMasters.length){console.log('No demo data found.');process.exit(0)}
  if(!apply){console.log('\nDry run only. Re-run with --apply to remove these rows.');process.exit(0)}
  await db.tx(async tx=>{
    const screenIds=foundScreens.map(s=>s.id);
    if(screenIds.length){
      await tx.query('DELETE FROM acknowledgements WHERE delivery_id IN (SELECT id FROM deliveries WHERE screen_id = ANY($1::text[]))',[screenIds]);
      await tx.query('DELETE FROM deliveries WHERE screen_id = ANY($1::text[])',[screenIds]);
      await tx.query('DELETE FROM media_tickets WHERE screen_id = ANY($1::text[])',[screenIds]);
      await tx.query("DELETE FROM schedules WHERE payload->>'screenId' = ANY($1::text[])",[screenIds]);
      await tx.query('DELETE FROM screens WHERE id = ANY($1::text[])',[screenIds]);
    }
    for(const r of foundResources){
      await tx.query('DELETE FROM favourites WHERE kind=$1 AND resource_id=$2',[r.kind,r.id]);
      await tx.query('DELETE FROM resources WHERE kind=$1 AND id=$2',[r.kind,r.id]);
    }
    for(const m of foundMasters)await tx.query('DELETE FROM masters WHERE kind=$1 AND id=$2',[m.kind,m.id]);
    await audit(tx,'remove-demo-data script','remove-demo-data','database','demo',{resources:foundResources.length,screens:foundScreens.length,masters:foundMasters.length});
    await releaseAll(tx,'Removed demo sample data');
  });
  console.log('\nDemo data removed and a new release queued for every profile.');
}finally{await db.close()}
