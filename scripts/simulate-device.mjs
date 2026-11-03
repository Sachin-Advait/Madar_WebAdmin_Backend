import {createHash} from 'node:crypto';
const origin=process.env.MADAR_URL||'http://127.0.0.1:8000',key=process.env.DEVICE_KEY;
if(!key)throw Error('Set DEVICE_KEY to a registered screen credential');
const headers={'X-Screen-Key':key,'Content-Type':'application/json'};
async function call(route,body){const r=await fetch(origin+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(route+': '+r.status+' '+await r.text());return r.status===204?null:r.json()}
const config=await call('/api/app/config');console.log('Assigned screen: '+config.screenId);
const d=await call('/api/app/sync');if(d){const digest=createHash('sha256').update(d.bundleText).digest('hex');if(digest!==d.digest)throw Error('Configuration checksum failed');await call('/api/app/ack',{deliveryId:d.deliveryId,stage:'received',digest});const b=JSON.parse(d.bundleText);for(const a of b.assets){const r=await fetch(origin+a.url,{headers});if(!r.ok)throw Error('Asset download failed');if(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==a.digest)throw Error('Asset checksum failed')}await call('/api/app/ack',{deliveryId:d.deliveryId,stage:'downloaded',digest});console.log('Downloaded and verified release '+d.version+'. Applied is intentionally left for a real renderer.')}
await call('/api/app/heartbeat',{appVersion:'simulator-2.0.0',page:config.assignedPage});
