import {writeFile} from 'node:fs/promises';
import {openDatabase,rows} from '../services/api/src/db.mjs';
import {seed} from '../services/api/src/seed.mjs';
import {dynamicCatalog} from '../services/api/src/cms.mjs';
import {reportingSummary} from '../services/api/src/reports.mjs';
const db=await openDatabase({memory:true});await seed(db,{demo:true});
const data={catalog:await dynamicCatalog(db),masters:(await rows(db,'SELECT * FROM masters')).map(r=>({...r.payload,id:r.id,kind:r.kind,revision:r.revision})),reportSummary:await reportingSummary(db),profiles:(await rows(db,'SELECT payload FROM profiles')).map(r=>r.payload),resources:await rows(db,'SELECT kind,id,draft,published,revision,updated_at FROM resources'),layouts:await rows(db,'SELECT * FROM layouts'),screens:(await rows(db,'SELECT id,payload,last_seen FROM screens')).map(r=>({...r.payload,id:r.id,lastSeen:r.last_seen})),schedules:[],users:[{id:'preview-admin',name:'MADAR Preview',email:'preview@madar.local',role:'admin',active:true}],audit:[]};
await writeFile(new URL('../apps/admin/src/showcase-data.json',import.meta.url),JSON.stringify(data));await db.close();
