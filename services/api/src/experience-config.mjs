// Shared profile defaults. Orientation follows logical window bounds, not the panel mount.
/**
 * The four Info Hub tabs shown on TVs. Admins rename them (English and Arabic)
 * and show or hide each one per profile; the sections inside each tab are
 * fixed. `pages` render side by side, `banners` as full-width strips.
 * `info-work` is Work & Support: Help Desk and Daily Tasks for today and this
 * week, fed by /api/app/operations rather than a page layout.
 */
export const defaultHubGroups=[
 {id:'live',title:'Live Status',titleAr:'الحالة المباشرة',enabled:true,pages:['info-meetings','info-queue'],banners:['info-alerts']},
 {id:'news',title:'News & Events',titleAr:'الأخبار والفعاليات',enabled:true,pages:['info-notices','info-events','info-media']},
 {id:'services',title:'Services & Guide',titleAr:'الخدمات والدليل',enabled:true,pages:['info-services','info-visitor']},
 {id:'work',title:'Work & Support',titleAr:'العمل والدعم',enabled:true,pages:['info-work']}
];
const hubIds=defaultHubGroups.map(g=>g.id);
// The five tabs used before the redesign; a saved layout with any of them is replaced.
const isLegacyLayout=groups=>Array.isArray(groups)&&groups.some(g=>['glance','updates','explore','management'].includes(g?.id));
/**
 * Returns the four tabs with their fixed sections. Saved titles and the
 * show/hide choice are kept; a layout saved before the four-tab redesign
 * (At a glance, Updates, Services, Explore, Management) becomes the defaults.
 */
export function withAllHubGroups(groups){
 const saved=Array.isArray(groups)&&!isLegacyLayout(groups)?groups:[];
 return defaultHubGroups.map(d=>{
  const g=saved.find(x=>x?.id===d.id)||{};
  return {...structuredClone(d),
   title:typeof g.title==='string'&&g.title.trim()?g.title:d.title,
   titleAr:typeof g.titleAr==='string'?g.titleAr:d.titleAr,
   enabled:g.enabled!==false};
 });
}
const allows=(p,k)=>Array.isArray(p?.allowedSections)&&(p.allowedSections.includes('*')||p.allowedSections.includes(k));
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
 const raw=input.hubGroups;
 if(raw!==undefined&&!isLegacyLayout(raw)){
  assert(Array.isArray(raw)&&raw.length===defaultHubGroups.length,`Info Hub needs ${defaultHubGroups.length} tabs`);
  const ids=new Set();
  for(const g of raw){
   assert(g&&typeof g==='object'&&Object.keys(g).every(k=>['id','title','titleAr','enabled','pages','banners'].includes(k)),'Invalid Info Hub tab');
   assert(hubIds.includes(g.id)&&!ids.has(g.id),'Info Hub tabs must be Live Status, News & Events, Services & Guide and Work & Support, once each');ids.add(g.id);
   assert(typeof g.title==='string'&&g.title.trim().length>0&&g.title.length<=50&&(g.titleAr===undefined||typeof g.titleAr==='string'&&g.titleAr.length<=50),'Invalid Info Hub tab title');
   assert(g.enabled===undefined||typeof g.enabled==='boolean','Info Hub tab visibility must be on or off');
  }
 }
 // Sections inside each tab are fixed; only titles and visibility are kept.
 e.hubGroups=withAllHubGroups(raw);
 assert(e.hubGroups.some(g=>g.enabled),'Show at least one Info Hub tab');
 return structuredClone(e);
}
export function resolvedExperience(profile,screen={}){
 const e={...experienceDefaults(profile),...profile.experience};
 // Work & Support needs the profile to allow Help Desk or Daily Tasks.
 e.hubGroups=withAllHubGroups(e.hubGroups).map(g=>g.id==='work'?{...g,enabled:g.enabled&&(allows(profile,'info-helpdesk')||allows(profile,'info-tasks'))}:g);
 if(['auto','portrait','landscape'].includes(screen.orientationOverride))e.orientation=screen.orientationOverride;
 return e;
}
