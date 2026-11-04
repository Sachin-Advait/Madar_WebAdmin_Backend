import http from 'node:http';
import {Server} from 'socket.io';
import pino from 'pino';
import {openDatabase} from './db.mjs';
import {seed} from './seed.mjs';
import {createApp,authenticateDevice} from './app.mjs';
import {dispatchDue} from './releases.mjs';
import {DeliveryStream} from './delivery-stream.mjs';
import {purgeExpiredPreferences} from './preferences.mjs';
const logger=pino({redact:['req.headers.authorization','req.headers.cookie','req.headers.x-screen-key']});
const production=process.env.NODE_ENV==='production',demo=process.env.MADAR_DEMO==='1';
if(production&&demo)throw Error('MADAR_DEMO must be disabled in production');
if(production&&!process.env.APP_ORIGIN?.startsWith('https://'))throw Error('Production APP_ORIGIN must use HTTPS');
if(production&&!process.env.REDIS_URL)throw Error('REDIS_URL is required for production Redis Streams delivery');
if(demo&&process.env.DATABASE_URL)logger.warn('MADAR_DEMO=1 adds sample channels, videos, notices and four demo screens with public keys to this database. Set MADAR_DEMO=0 for real use and run scripts/remove-demo-data.mjs to clean it.');
const db=await openDatabase();await seed(db,{demo});let redis=null,sub=null;
if(process.env.REDIS_URL){const {createClient}=await import('redis');redis=createClient({url:process.env.REDIS_URL,disableOfflineQueue:true});redis.on('error',e=>logger.warn({message:e.message},'Redis unavailable'));await redis.connect()}
const server=http.createServer(createApp({db,demo,redis,logger}));
const io=new Server(server,{maxHttpBufferSize:8192,transports:['websocket'],cors:{origin:process.env.APP_ORIGIN||false}});
io.use(async(socket,next)=>{try{const s=await authenticateDevice(db,socket.handshake.auth?.deviceKey);socket.data.screenId=s.id;next()}catch{next(Error('Invalid device credential'))}});
io.on('connection',socket=>{socket.join(socket.data.screenId);socket.emit('sync-required',{reason:'connected'})});
if(redis){const {createAdapter}=await import('@socket.io/redis-adapter');sub=redis.duplicate();sub.on('error',e=>logger.warn({message:e.message},'Redis subscriber unavailable'));await sub.connect();io.adapter(createAdapter(redis,sub))}
const emit=(id,payload)=>{io.to(id).emit('sync-required',payload)};
const delivery=redis?new DeliveryStream({db,redis,emit,logger}):null;
let working=false;
async function deliveryTick(){if(working)return;working=true;try{if(delivery)await delivery.tick();else await dispatchDue(db,emit)}catch(e){logger.error({err:e},'Delivery retry cycle failed')}finally{working=false}}
let pruning=false;
async function preferenceMaintenance(){if(pruning)return;pruning=true;try{await purgeExpiredPreferences(db)}catch(e){logger.error({err:e},'Preference retention cleanup failed')}finally{pruning=false}}
const preferenceTimer=setInterval(preferenceMaintenance,60000);preferenceMaintenance();
const timer=setInterval(deliveryTick,1000);
deliveryTick();
const port=Number(process.env.PORT||8000);server.listen(port,process.env.HOST||'127.0.0.1',()=>logger.info({url:'http://127.0.0.1:'+port,database:db.engine,demo,delivery:delivery?'redis-streams':'sql-development'},'MADAR ready'));
let stopping=false;async function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(preferenceTimer);server.close();await new Promise(resolve=>io.close(resolve));while(working||pruning)await new Promise(r=>setTimeout(r,50));await sub?.quit();await redis?.quit();await db.close();process.exit(0)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
