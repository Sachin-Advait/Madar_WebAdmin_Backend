import {writeFile} from 'node:fs/promises';
import {openDatabase,one} from '../services/api/src/db.mjs';
import {seed} from '../services/api/src/seed.mjs';
import {managedOperations} from '../services/api/src/managed-operations.mjs';
const db=await openDatabase({url:'',memory:true});await seed(db,{demo:true});
const release=await one(db,"SELECT bundle FROM releases WHERE profile_id='public' ORDER BY version DESC LIMIT 1");
const operations={meeting:await managedOperations(db,'meeting',release.bundle.profile),queue:await managedOperations(db,'queue',release.bundle.profile)};
await writeFile(new URL('../apps/tv/assets/demo.json',import.meta.url),JSON.stringify({bundle:release.bundle,operations},null,2));
console.log('Exported',Object.values(release.bundle.content).reduce((n,list)=>n+list.length,0),'published sample records');await db.close();
