import initial from './showcase-data.json';
const key='madar-showcase-v4';let state:any;try{state=JSON.parse(localStorage.getItem(key)||'null')||structuredClone(initial)}catch{state=structuredClone(initial)}
const commit=()=>localStorage.setItem(key,JSON.stringify(state));
const now=()=>new Date().toISOString();
function previewOperations(source:string,profile:any){
 const kind=source==='meeting'?'meetings':'queueTickets',master=source==='meeting'?'rooms':'counters';
 const records=state.resources.filter((r:any)=>r.kind===kind&&r.published?.status==='published'&&r.published.visibleTo?.includes(profile.profileType)).map((r:any)=>r.published),masters=state.masters.filter((r:any)=>r.kind===master&&r.active),today=now().slice(0,10);
 if(source==='meeting'){const entries=records.filter((r:any)=>r.eventStart?.slice(0,10)===today);return {availability:'simulated',todayMeetings:entries.length,ongoing:entries.filter((r:any)=>Date.parse(r.eventStart)<=Date.now()&&Date.parse(r.eventEnd)>Date.now()).length,upcoming:entries.filter((r:any)=>Date.parse(r.eventStart)>Date.now()).length,rooms:masters.map((m:any)=>({name:m.name,status:entries.some((r:any)=>r.roomId===m.id&&Date.parse(r.eventStart)<=Date.now()&&Date.parse(r.eventEnd)>Date.now())?'occupied':m.status})),schedule:entries.map((r:any)=>({time:r.eventStart,room:masters.find((m:any)=>m.id===r.roomId)?.name||r.roomId,title:['public','vip','signage'].includes(profile.profileType)?r.publicTitle||'Reserved':r.title}))};}
 return {availability:'simulated',servedToday:records.filter((r:any)=>r.queueState==='served').length,waiting:records.filter((r:any)=>r.queueState==='waiting').length,activeCounters:masters.filter((m:any)=>['available','serving'].includes(m.status)).length,calls:records.filter((r:any)=>r.queueState==='calling').map((r:any)=>({ticket:r.ticket,counter:masters.find((m:any)=>m.id===r.counterId)?.name||r.counterId})),counters:masters.map((m:any)=>({name:m.name,status:m.status}))};
}
function journal(action:string,entity:string,id:string){state.audit.unshift({id:crypto.randomUUID(),action,entity,entityId:id,actor:'Preview user',time:now(),occurred_at:now(),detail:{scope:'browser-only preview'}})}
export async function showcaseRequest<T>(url:string,options:RequestInit={}):Promise<T>{
 const u=new URL(url,location.origin==='null'?'https://preview.local':location.origin),p=u.pathname.split('/').filter(Boolean).slice(1),method=options.method||'GET';if(options.body instanceof FormData)throw Error('Run the included Node.js backend to upload and verify assets.');const body=typeof options.body==='string'?JSON.parse(options.body):{};let result:any;const profile=u.searchParams.get('profileId')||'public';
 if(p[0]==='auth')result=p[1]==='login'?{token:'preview',user:state.users[0]}:{ok:true};
 else if(p[0]==='admin'){
  const area=p[1],id=p[2];
  if(area==='me')result=state.users[0];
  else if(area==='catalog')result={...state.catalog,demo:true};
  else if(area==='overview')result={screens:state.screens.length,online:0,synced:0,layouts:state.layouts.length,contentCounts:Object.fromEntries(Object.keys(state.catalog.resources).map(k=>[k,state.resources.filter((r:any)=>r.kind===k).length])),recentActivity:state.audit,demo:true};
  else if(area==='masters'){
   if(method==='GET')result=state.masters.filter((r:any)=>r.kind===id);
   else if(method==='DELETE'){state.masters=state.masters.filter((r:any)=>r.id!==p[3]);result={ok:true}}
   else{const current=state.masters.find((r:any)=>r.id===p[3]);if(current){Object.assign(current,body.payload);current.revision++}else state.masters.push({...body.payload,kind:id,id:crypto.randomUUID(),revision:1});result={ok:true};journal('save-master',id,p[3]||'new')}
  }else if(area==='content-types'){
   if(method==='GET')result=state.catalog.fieldDefinitions;
   else{state.catalog.fieldDefinitions[id]={kind:id,fields:body.fields,revision:(state.catalog.fieldDefinitions[id]?.revision||0)+1};state.catalog.resourceSchemas[id].properties.customFields={type:'object',title:'Additional information',properties:Object.fromEntries(body.fields.map((f:any)=>[f.key,{type:f.type==='number'?'number':f.type==='boolean'?'boolean':'string',title:f.label,...(f.type==='select'?{enum:f.options}:{})}])),additionalProperties:false};result=state.catalog.fieldDefinitions[id]}
  }else if(area==='reports'){
   if(id==='summary')result={...state.reportSummary,devices:{total:state.screens.length,enabled:state.screens.filter((r:any)=>r.enabled!==false).length,disabled:state.screens.filter((r:any)=>r.enabled===false).length,online:0,offline:state.screens.filter((r:any)=>r.enabled!==false).length,synced:0},generatedAt:now(),content:Object.entries(state.catalog.resources).map(([kind,meta]:any)=>({kind,label:meta.label,total:state.resources.filter((r:any)=>r.kind===kind).length,published:state.resources.filter((r:any)=>r.kind===kind&&r.published?.status==='published').length,review:state.resources.filter((r:any)=>r.kind===kind&&r.draft?.status==='review').length}))};
   else{const reportRows=id==='devices'?state.screens.map((r:any)=>({name:r.name,profile:r.profileId,location:r.location,group:r.groupName,status:r.enabled===false?'disabled':'offline',synced:false,lastSeen:r.lastSeen||'',appVersion:''})):id==='content'?state.resources.map((r:any)=>({section:r.kind,title:r.draft.title,category:r.draft.category||'',draftStatus:r.draft.status,publishedStatus:r.published?.status||'unpublished',owner:r.draft.owner||'',revision:r.revision,updatedAt:r.updated_at||now()})):id==='delivery'?state.screens.map((r:any)=>({screen:r.name,profile:r.profileId,status:'preview-only',attempts:0})):id==='publishing'?state.audit:[];const q=(u.searchParams.get('query')||'').toLowerCase(),status=u.searchParams.get('status');const selectedProfile=u.searchParams.get('profileId'),from=u.searchParams.get('from'),to=u.searchParams.get('to');const list=reportRows.filter((r:any)=>{const date=String(r.time||r.updatedAt||now()).slice(0,10);return (!q||Object.values(r).join(' ').toLowerCase().includes(q))&&(!status||r.status===status||r.draftStatus===status)&&(!selectedProfile||r.profile===selectedProfile)&&(id==='devices'||((!from||date>=from)&&(!to||date<=to)));});result={name:id,rows:list,columns:reportRows.length?Object.keys(reportRows[0]):['title','saves'],returned:list.length,truncated:false,generatedAt:now()}}
  }
  else if(area==='resources'){
   if(p[3]==='import')throw Error('Run the included Node.js backend for validated atomic content imports.');
   if(method==='GET')result=state.resources.filter((r:any)=>r.kind===id).map((r:any)=>({...((u.searchParams.get('published')==='1'?r.published:r.draft)||{}),id:r.id,revision:r.revision,updatedAt:now()}));
   else if(method==='DELETE'){state.resources=state.resources.filter((r:any)=>r.id!==p[3]);result={ok:true}}
   else{let r=state.resources.find((r:any)=>r.id===p[3]);if(r){if(r.revision!==body.expectedRevision)throw Error('Content changed; reload first.');r.draft=body.payload;r.revision++;if(['published','disabled'].includes(body.payload.status))r.published=body.payload}else{r={id:crypto.randomUUID(),kind:id,revision:1,draft:body.payload,published:body.payload.status==='published'?body.payload:null};state.resources.push(r)}result={...r.draft,id:r.id,revision:r.revision};journal('save-content',id,r.id)}
  }else if(area==='layouts'){
   let l=state.layouts.find((r:any)=>r.page_key===id&&r.profile_id===profile);if(!l)throw Error('Layout not found');
   if(p[3]==='versions')result=(l.versions||[{version:1,layout:l.published}]).map((r:any)=>({...r,publishedAt:now(),publishedBy:'Preview user'}));
   else if(p[3]==='publish'){l.published=structuredClone(l.draft);l.published_version++;(l.versions??=[]).unshift({version:l.published_version,layout:structuredClone(l.published)});result={publishedVersion:l.published_version};journal('preview-publication','layout',id)}
   else if(p[3]==='rollback'){const v=l.versions?.find((r:any)=>r.version===body.version);l.draft=structuredClone(v?.layout||state.catalog.defaults[id]);l.revision++;result={ok:true}}
   else if(method==='PUT'){if(l.revision!==body.expectedRevision)throw Error('Draft changed; reload first.');l.draft=body.layout;l.revision++;result={revision:l.revision}}
   else result={pageKey:id,profileId:profile,draft:l.draft,published:l.published,revision:l.revision,publishedVersion:l.published_version,updatedAt:now()};
  }else if(area==='profiles'){
   if(method==='GET')result=state.profiles;
   else{const index=state.profiles.findIndex((p:any)=>p.id===body.id);if(index<0){state.profiles.push(body);for(const [page,l]of Object.entries(state.catalog.defaults))state.layouts.push({page_key:page,profile_id:body.id,draft:l,published:l,revision:1,published_version:1})}else state.profiles[index]=body;result=body;journal('preview-profile','profile',body.id)}
  }else if(area==='preview'){
   const l=state.layouts.find((r:any)=>r.page_key===id&&r.profile_id===profile),pr=state.profiles.find((r:any)=>r.id===profile);const layout=u.searchParams.get('mode')==='draft'?l.draft:l.published;
   result={schemaVersion:1,pageKey:id,profileId:profile,theme:pr.theme,publishedVersion:l.published_version,generatedAt:now(),sections:layout.sections.filter((s:any)=>s.enabled).map((s:any)=>{const source=state.catalog.widgets[s.type].source;let data:any;if(source==='meeting'||source==='queue')data=previewOperations(source,pr);else if(source==='links')data=Object.entries(state.catalog.pages).filter(([k])=>k.startsWith('info-')&&k!=='info-hub').map(([pageKey,title])=>({pageKey,title}));else data=state.resources.filter((r:any)=>r.kind===source&&r.published?.status==='published'&&r.published.visibleTo?.includes(pr.profileType)).map((r:any)=>({...r.published,id:r.id}));return {...s,source,data}})};
  }else if(area==='screens'||area==='schedules'||area==='users'){
   if(p[3]==='preferences')throw Error('Device history reset requires the connected backend.');if(method==='GET')result=state[area];else if(p[3]==='rotate-key')throw Error('Credential rotation is available in the full backend.');else if(method==='DELETE'){state[area]=state[area].filter((r:any)=>r.id!==id);result={ok:true}}else{const index=state[area].findIndex((r:any)=>r.id===id),r={...body,id:id||crypto.randomUUID()};if(index<0)state[area].push(r);else state[area][index]=r;result={...r,screenKey:area==='screens'?'Preview only — use the backend to pair a real screen':undefined};journal('preview-save',area,r.id)}
  }else if(area==='audit')result=state.audit;
  else if(area==='settings'){state.settings??={organizationName:'MADAR',defaultLanguage:'en',refreshSeconds:20};if(method==='PUT')state.settings=body;result=state.settings}
  else if(area==='recommendation-summary')result={model:'madar-interest-v1',algorithm:'Explainable content-based interest ranking',retentionDays:90,maxProgressPerDevice:500,devices:{total:state.screens.length,persistent:state.screens.filter((s:any)=>['employee','management'].includes(s.profileId)).length,session:0,off:state.screens.filter((s:any)=>!['employee','management'].includes(s.profileId)).length,recommendationsEnabled:state.screens.length},stored:{devicesWithHistory:0,progressItems:0,activeSessions:0},features:['category','language','tags'],externalAi:false};
  else if(area==='source-import')throw Error('Connect the included backend to preview and import channel source files.');
  else if(area==='integrations')result={demo:true,feeds:[],ingestConfigured:false,mediaConfigured:false};
  else if(['deliveries','enrollments','assets'].includes(area))result=[];
  else throw Error('This action requires the included Node.js backend.');
 }else throw Error('This action requires the included Node.js backend.');
 if(method!=='GET')commit();return structuredClone(result) as T;
}
