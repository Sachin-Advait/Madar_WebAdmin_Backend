import path from 'node:path';
import {readFile,mkdir,readdir} from 'node:fs/promises';
export async function openDatabase({url=process.env.DATABASE_URL,dataDir=process.env.PGLITE_PATH||'./data/dev-postgres',memory=false}={}) {
  let db;
  if(url){
    const {Pool}=await import('pg'); const pool=new Pool({connectionString:url,max:12,connectionTimeoutMillis:5000});
    db={query:(text,args)=>pool.query(text,args),exec:text=>pool.query(text),close:()=>pool.end(),engine:'PostgreSQL',tx:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}};
  }else{
    if(process.env.NODE_ENV==='production')throw Error('DATABASE_URL is required in production');
    if(!memory)await mkdir(dataDir,{recursive:true});
    const {PGlite}=await import('@electric-sql/pglite');const p=new PGlite(memory?undefined:path.relative(process.cwd(),path.resolve(dataDir)).replaceAll('\\','/'));await p.waitReady;
    let tail=Promise.resolve();const run=fn=>{const r=tail.then(fn);tail=r.catch(()=>{});return r};
    db={query:(text,args)=>run(()=>p.query(text,args)),exec:text=>run(()=>p.exec(text)),close:()=>run(()=>p.close()),engine:'PGlite (development PostgreSQL)',tx:fn=>run(()=>p.transaction(t=>fn({query:(sql,args)=>t.query(sql,args)})))};
  }
  const migrations=new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort())
    await db.exec(await readFile(new URL(file,migrations),'utf8'));
  return db;
}
export const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
export const rows=async(db,sql,args=[]) => (await db.query(sql,args)).rows;
