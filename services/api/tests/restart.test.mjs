import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase,one} from '../src/db.mjs';
import {seed} from '../src/seed.mjs';
import {dispatchDue} from '../src/releases.mjs';
test('pending updates survive a persistent PostgreSQL-compatible database restart',async()=>{const dataRoot=path.join(process.cwd(),'data');await mkdir(dataRoot,{recursive:true});const dir=await mkdtemp(path.join(dataRoot,'madar-restart-'));let d;try{d=await openDatabase({url:'',dataDir:path.relative(process.cwd(),path.join(dir,'pg')).replaceAll('\\','/')});await seed(d,{demo:true});const before=await one(d,"SELECT id,release_id FROM deliveries WHERE status='pending' ORDER BY id LIMIT 1");await d.exec('ALTER TABLE deliveries DROP COLUMN stream_id; ALTER TABLE deliveries DROP COLUMN stream_enqueued_at; DELETE FROM schema_migrations WHERE version=2;');await d.close();d=await openDatabase({url:'',dataDir:path.relative(process.cwd(),path.join(dir,'pg')).replaceAll('\\','/')});const after=await one(d,'SELECT * FROM deliveries WHERE id=$1',[before.id]);assert.equal(after.release_id,before.release_id);assert.equal(after.status,'pending');assert.equal(after.stream_id,null);assert.ok(await one(d,'SELECT version FROM schema_migrations WHERE version=2'));let emitted=0;await dispatchDue(d,()=>emitted++);assert.ok(emitted>0)}finally{await d?.close();await rm(dir,{recursive:true,force:true})}});
