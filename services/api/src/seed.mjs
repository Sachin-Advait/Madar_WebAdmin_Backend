import {experienceDefaults} from './experience-config.mjs';
import {enrichDemo} from './sample-data.mjs';
import {catalog,uid,hashPassword,validPassword,profileTypes,sha} from './domain.mjs';
import {one,rows} from './db.mjs';
import {releaseAll,releaseProfile} from './releases.mjs';
export async function seed(db,{demo=false,password=process.env.BOOTSTRAP_PASSWORD,email=process.env.BOOTSTRAP_EMAIL||'admin@madar.local'}={}){
 if(!await one(db,'SELECT id FROM users LIMIT 1')){
   if(!password&&demo)password='MadarDemo!2026#';
   if(password){validPassword(password);await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[uid(),email,'MADAR Administrator','admin',await hashPassword(password)])}
 }
 if(await one(db,'SELECT id FROM profiles LIMIT 1')){await db.tx(async tx=>{if(demo&&await enrichDemo(tx))await releaseAll(tx,'Additional demo content');for(const p of await rows(tx,'SELECT id FROM profiles ORDER BY id')){const latest=await one(tx,'SELECT bundle FROM releases WHERE profile_id=$1 ORDER BY version DESC LIMIT 1',[p.id]);if(latest?.bundle.experienceVersion!==4)await releaseProfile(tx,p.id,'Upgrade published TV experience to v4')}});return;}
 await db.tx(async tx=>{
  for(const type of profileTypes){
   const p={id:type,name:{public:'Public / Visitor',employee:'Employee',management:'Management',vip:'VIP Lounge',signage:'Dedicated Signage'}[type],description:{public:'Welcoming spaces and public information',employee:'Internal communication and learning',management:'Operations and executive information',vip:'Curated hospitality and premium media',signage:'Focused meeting and queue boards'}[type],profileType:type,theme:{accent:'#6b5837',mode:'light',language:'en',density:'comfortable'},allowedSections:['*']};
   p.experience=experienceDefaults(p);
   await tx.query('INSERT INTO profiles(id,payload) VALUES($1,$2)',[type,JSON.stringify(p)]);
   for(const [page,l] of Object.entries(catalog.defaults)){
    await tx.query('INSERT INTO layouts(page_key,profile_id,draft,published,published_version) VALUES($1,$2,$3,$3,1)',[page,type,JSON.stringify(l)]);
    await tx.query('INSERT INTO layout_versions(page_key,profile_id,version,layout,published_by) VALUES($1,$2,1,$3,$4)',[page,type,JSON.stringify(l),'initialization']);
   }
  }
  if(demo){
   for(const [kind,items] of Object.entries(catalog.seeds))for(const [i,[title,category,ref]] of items.entries()){
    const p={title,titleAr:'',description:({featured:'A clearer view of everything that matters. Explore services, stories and experiences.',notices:'Please visit the reception desk for guidance. Our team is here to help.',events:'Join colleagues for practical ideas, shared learning and new perspectives.',visitor:'A welcoming place to begin your visit. Follow the wayfinding signs from the main entrance.',services:'Find the information you need and prepare before your visit.'})[kind]||'Discover more with MADAR.',category,status:'published',visibleTo:profileTypes,sortOrder:i,image:kind==='channels'||kind==='radio'?'':'/art/'+['horizon','architecture','learning','landscape'][i%4]+'.svg',startAt:'',endAt:'',owner:'Communications'};
    if(kind==='channels')Object.assign(p,{streamRef:ref,epgId:ref,number:i+1,catchupEnabled:i===0||i===2});
    if(kind==='videos')Object.assign(p,{videoRef:ref,durationSeconds:420*(i+1),language:'en',featured:i===0});
    if(kind==='replay')Object.assign(p,{channelId:i===0?'cha-001':'cha-003',providerRef:ref,retentionDays:7,available:true,title:i===0?'Morning bulletin • Oman TV':'Nature discoveries • Episode 3',eventStart:new Date(Date.now()-(i+1)*86400000).toISOString(),eventEnd:new Date(Date.now()-(i+1)*86400000+1800000).toISOString(),endAt:new Date(Date.now()+(6-i)*86400000).toISOString(),durationSeconds:1800,language:'en'});
    if(kind==='radio')Object.assign(p,{stationRef:ref,language:'ar'});
    if(kind==='featured')Object.assign(p,{targetType:i===0?'video':'channel',targetId:i===0?'vid-002':'cha-001',ctaText:'Explore now'});
    if(kind==='notices')Object.assign(p,{priority:i===0?'important':'normal',department:'Communications',referenceNumber:'NT-2026-'+(101+i)});
    if(kind==='events')Object.assign(p,{venue:i===0?'Main auditorium':'Learning studio',eventStart:'2026-11-10T09:00:00+04:00',eventEnd:'2026-11-10T12:00:00+04:00',organizer:'Learning & Development',audience:'All employees'});
    if(kind==='services')Object.assign(p,{requirements:'Valid identification and appointment reference',contact:'Reception desk',hours:'07:30 – 14:30'});
    if(kind==='visitor')Object.assign(p,{floor:'Ground floor',building:'Main building',openingHours:'07:30 – 14:30',accessibility:'Step-free access via the east entrance'});
    if(kind==='alerts')Object.assign(p,{severity:'info',fullScreenOverride:false,endAt:'2027-01-01T00:00:00Z',instructions:'For assistance, speak to the reception team.'});
    await tx.query('INSERT INTO resources(kind,id,draft,published) VALUES($1,$2,$3,$3)',[kind,kind.slice(0,3)+'-'+String(i+1).padStart(3,'0'),JSON.stringify(p)]);
   }
   for(const [i,name,profile,location] of [[1,'Reception · Main lobby','public','Ground floor'],[2,'Executive lounge','management','Level 3'],[3,'Learning centre','employee','Level 1'],[4,'VIP reception','vip','East wing']]){
    await tx.query('INSERT INTO screens(id,payload,profile_id,token_hash) VALUES($1,$2,$3,$4)',['demo-screen-'+i,JSON.stringify({name,profileId:profile,location,groupName:'Main building',assignedPage:i===2?'info-hub':'home',enabled:true}),profile,sha('madar-demo-screen-token-only-'+i)]);
   }
  }
  if(demo)await enrichDemo(tx);
  for(const [k,v] of Object.entries({organizationName:'MADAR',defaultLanguage:'en',refreshSeconds:20}))await tx.query('INSERT INTO settings(key,value) VALUES($1,$2)',[k,JSON.stringify(v)]);
  await releaseAll(tx,'Initial published configuration');
 });
}
