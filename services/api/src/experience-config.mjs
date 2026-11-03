// Shared profile defaults. Orientation follows logical window bounds, not the panel mount.
export const defaultHubGroups=[
 {id:'glance',title:'At a glance',titleAr:'نظرة عامة',pages:['info-meetings','info-queue']},
 {id:'updates',title:'Updates',titleAr:'المستجدات',pages:['info-notices','info-alerts']},
 {id:'services',title:'Services',titleAr:'الخدمات',pages:['info-services','info-visitor']},
 {id:'explore',title:'Explore',titleAr:'استكشف',pages:['info-events','info-media']}
];
const assert=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{status:422})};
export function experienceDefaults(profile={}){
 return {orientation:'auto',historyMode:['employee','management'].includes(profile.profileType)?'device':'off',recommendations:true,completionThreshold:0.95,hubGroups:structuredClone(defaultHubGroups)};
}
export function validateExperience(value,profile){
 assert(value===undefined||(value&&typeof value==='object'&&!Array.isArray(value)),'Invalid TV experience settings');
 const input=value||{},allowed=['orientation','historyMode','recommendations','completionThreshold','hubGroups'];
 assert(Object.keys(input).every(k=>allowed.includes(k)),'Unknown TV experience setting');
 const e={...experienceDefaults(profile),...input};
 assert(['auto','landscape','portrait'].includes(e.orientation),'Invalid TV orientation');
 assert(['off','session','device'].includes(e.historyMode),'Invalid viewing history mode');
 assert(typeof e.recommendations==='boolean','Recommendations must be enabled or disabled');
 assert(Number.isFinite(e.completionThreshold)&&e.completionThreshold>=0.8&&e.completionThreshold<=1,'Completion threshold must be 0.8 to 1');
 const pages=defaultHubGroups.flatMap(g=>g.pages),seen=new Set(),ids=new Set();
 assert(Array.isArray(e.hubGroups)&&e.hubGroups.length===4,'Info Hub needs four groups');
 for(const g of e.hubGroups){
  assert(g&&typeof g==='object'&&Object.keys(g).every(k=>['id','title','titleAr','pages'].includes(k)),'Invalid Info Hub group');
  assert(typeof g.id==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(g.id)&&!ids.has(g.id),'Info Hub group IDs must be unique');ids.add(g.id);
  assert(typeof g.title==='string'&&g.title.trim().length>0&&g.title.length<=50&&(!g.titleAr||typeof g.titleAr==='string'&&g.titleAr.length<=50),'Invalid Info Hub group title');
  assert(Array.isArray(g.pages)&&g.pages.length===2,'Each Info Hub group needs two sections');
  for(const page of g.pages){assert(pages.includes(page)&&!seen.has(page),'Each Info Hub section must appear exactly once');seen.add(page)}
 }
 return structuredClone(e);
}
export function resolvedExperience(profile,screen={}){
 const e={...experienceDefaults(profile),...profile.experience};
 if(['auto','portrait','landscape'].includes(screen.orientationOverride))e.orientation=screen.orientationOverride;
 return e;
}
