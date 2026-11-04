import {writeFile} from 'node:fs/promises';
import {openDatabase,one} from '../services/api/src/db.mjs';
import {seed} from '../services/api/src/seed.mjs';
import {managedOperations} from '../services/api/src/managed-operations.mjs';
import {createOdooService} from '../services/api/src/odoo.mjs';
import {releaseAll} from '../services/api/src/releases.mjs';
const db=await openDatabase({url:'',memory:true});await seed(db,{demo:true});
// The sample TV shows every Info Hub page, including the Odoo-backed Help Desk and Daily Tasks.
await db.query("INSERT INTO settings(key,value) VALUES('odoo',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify({profiles:[]})]);await db.tx(tx=>releaseAll(tx,'Demo export'));
const release=await one(db,"SELECT bundle FROM releases WHERE profile_id='public' ORDER BY version DESC LIMIT 1");
const operations={meeting:await managedOperations(db,'meeting',release.bundle.profile),queue:await managedOperations(db,'queue',release.bundle.profile)};
const odoo=createOdooService({db,demo:true});for(const kind of ['helpdesk','tasks'])operations[kind]=await odoo.operational(kind,release.bundle.profile);
await writeFile(new URL('../apps/tv/assets/demo.json',import.meta.url),JSON.stringify({bundle:release.bundle,operations},null,2));
console.log('Exported',Object.values(release.bundle.content).reduce((n,list)=>n+list.length,0),'published sample records');await db.close();
