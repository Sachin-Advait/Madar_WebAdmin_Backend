import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {BrainCircuit,Monitor,PanelLeft,ShieldCheck} from 'lucide-react';
import {request} from '../api';
import {Card,ErrorBox,FormField,Loading} from './Common';
import './experience-settings.css';

export type HubGroup={id:'live'|'news'|'services'|'work';title:string;titleAr:string;enabled:boolean;pages:string[];banners?:string[]};
export type Experience={orientation:'auto'|'landscape'|'portrait';historyMode:'off'|'session'|'device';recommendations:boolean;completionThreshold:number;hubGroups:HubGroup[]};
export const hubPageNames:Record<string,string>={'info-meetings':'Meeting rooms','info-queue':'Queue management','info-notices':'Official notices','info-alerts':'Priority alerts','info-services':'Services & information','info-visitor':'Visitor guide','info-events':'Events & training','info-media':'Media highlights','info-work':'Helpdesk and tasks, with Today / This week','info-helpdesk':'Help Desk','info-tasks':'Daily tasks'};
/** The four TV Info Hub tabs. Titles and visibility are editable; the sections in each tab are fixed. */
export const defaultGroups:HubGroup[]=[
 {id:'live',title:'Live Status',titleAr:'الحالة المباشرة',enabled:true,pages:['info-meetings','info-queue'],banners:['info-alerts']},
 {id:'news',title:'News & Events',titleAr:'الأخبار والفعاليات',enabled:true,pages:['info-notices','info-events','info-media']},
 {id:'services',title:'Services & Guide',titleAr:'الخدمات والدليل',enabled:true,pages:['info-services','info-visitor']},
 {id:'work',title:'Work & Support',titleAr:'العمل والدعم',enabled:true,pages:['info-work']},
];
const legacyIds=['glance','updates','explore','management'];
/** Keeps saved titles and visibility; a profile saved with the old five-tab layout starts from the four defaults. */
function withAllGroups(groups?:Partial<HubGroup>[]):HubGroup[]{
 const saved=Array.isArray(groups)&&!groups.some(g=>legacyIds.includes(String(g?.id)))?groups:[];
 return defaultGroups.map(d=>{const g=saved.find(x=>x?.id===d.id)||{};return {...structuredClone(d),title:typeof g.title==='string'&&g.title.trim()?g.title:d.title,titleAr:typeof g.titleAr==='string'?g.titleAr:d.titleAr,enabled:g.enabled!==false}});
}
export function experienceDefaults(profileType:string,value?:Partial<Experience>):Experience{
 const persistent=['employee','management'].includes(profileType);
 return {orientation:'auto',historyMode:persistent?'device':'off',recommendations:true,completionThreshold:.95,...value,hubGroups:withAllGroups(value?.hubGroups)};
}
export function ExperienceSettings({value,onChange,disabled=false}:{value:Experience;onChange:(value:Experience)=>void;disabled?:boolean}){
 function patch<K extends keyof Experience>(key:K,next:Experience[K]){onChange({...value,[key]:next})}
 function group(index:number,next:Partial<HubGroup>){patch('hubGroups',value.hubGroups.map((g,i)=>i===index?{...g,...next}:g))}
 const shown=value.hubGroups.filter(g=>g.enabled).length;
 return <fieldset className="experience-fieldset" disabled={disabled}>
  <legend><Monitor size={17}/> Screen layout & viewing</legend>
  <div className="experience-note">Landscape uses top navigation. Portrait uses a compact side rail, mirrored for Arabic. Automatic layout follows the app's available width and height.</div>
  <div className="form-grid">
   <FormField label="Preferred orientation" help="A screen can override this profile setting."><select value={value.orientation} onChange={e=>patch('orientation',e.target.value as Experience['orientation'])}><option value="auto">Automatic · match available space</option><option value="landscape">Landscape · top navigation</option><option value="portrait">Portrait · side navigation</option></select></FormField>
   <FormField label="Viewing history" help="Shared and public screens should use Off or Session."><select value={value.historyMode} onChange={e=>patch('historyMode',e.target.value as Experience['historyMode'])}><option value="off">Off · do not remember viewing</option><option value="session">Session · memory only until app restart</option><option value="device">Device · persist resume & interests</option></select></FormField>
   <FormField label="Mark watched at (%)" help="Completed videos leave Continue Watching."><input type="number" min="80" max="100" step="1" value={Math.round(value.completionThreshold*100)} onChange={e=>patch('completionThreshold',Math.min(100,Math.max(80,Number(e.target.value)||95))/100)}/></FormField>
   <label className="checkline experience-check"><input type="checkbox" checked={value.recommendations} onChange={e=>patch('recommendations',e.target.checked)}/><span>Show recommendations<small>Uses permitted content; device learning follows the history setting.</small></span></label>
  </div>
  <div className="experience-note"><ShieldCheck size={16}/> Preferences belong to the device, not an identified person. No camera, microphone or demographic profiling is used.</div>
  <h4 className="experience-section-title"><PanelLeft size={17}/> Info Hub tabs</h4>
  <p className="experience-note">TVs on this profile show these four tabs in this order. Rename them or hide the ones this audience does not need. Work & Support shows Help Desk and Daily Tasks from Odoo with a Today / This week switch; it needs Help Desk or Daily Tasks in the allowed sections above, and this profile selected in Integrations → Odoo. Until then the tab shows a "no data" message. Priority full-screen alerts appear whichever tab is open.</p>
  <div className="hub-group-editor">{value.hubGroups.map((g,index)=><div className={`hub-group-row${g.enabled?'':' is-hidden'}`} key={g.id}>
   <span className="hub-group-number">0{index+1}</span>
   <div className="form-grid">
    <FormField label="Tab title"><input maxLength={50} required value={g.title} onChange={e=>group(index,{title:e.target.value})}/></FormField>
    <FormField label="Arabic title"><input dir="rtl" maxLength={50} value={g.titleAr} onChange={e=>group(index,{titleAr:e.target.value})}/></FormField>
    <label className="checkline experience-check"><input type="checkbox" checked={g.enabled} disabled={g.enabled&&shown===1} onChange={e=>group(index,{enabled:e.target.checked})}/><span>Show this tab on TVs<small>{g.enabled&&shown===1?'At least one tab must stay visible.':g.enabled?'Visible':'Hidden from TVs on this profile'}</small></span></label>
    <div className="hub-group-sections"><span className="field-label">Sections</span><ul>{[...g.pages,...(g.banners||[])].map(p=><li key={p}>{hubPageNames[p]||p}</li>)}</ul></div>
   </div>
  </div>)}</div>
 </fieldset>;
}

export function RecommendationSummary(){
 const query=useQuery<any>({queryKey:['recommendation-summary'],queryFn:()=>request('/api/admin/recommendation-summary')});
 return <Card className="recommendation-summary"><div className="card-head"><div><h3><BrainCircuit size={18}/> Device recommendations</h3><p>A small, explainable interest model for the content already in your catalogue.</p></div></div>
 {query.isLoading?<Loading/>:query.error?<ErrorBox error={query.error}/>:<><div className="experience-note">Viewing completion and favourites inform category, language and tag preferences. Recent signals carry more weight; new devices start with editorial content.</div><dl className="recommendation-facts"><div><dt>Model</dt><dd>{query.data?.model||'Content-based device interests'}</dd></div><div><dt>Persistent devices</dt><dd>{query.data?.devices?.persistent??0} / {query.data?.devices?.total??0}</dd></div><div><dt>History retained</dt><dd>{query.data?.retentionDays??90} days</dd></div><div><dt>History disabled</dt><dd>{query.data?.devices?.off??0} devices</dd></div><div><dt>Session only</dt><dd>{query.data?.devices?.session??0} devices</dd></div><div><dt>Devices with history</dt><dd>{query.data?.stored?.devicesWithHistory??0}</dd></div></dl><div className="experience-note">{query.data?.algorithm||'Explainable content-based interest ranking'}. When history is off or session-only, server recommendations use editorial content. {query.data?.externalAi===false?'No external AI service is used.':''}</div></>}
 <p className="experience-note">Change learning and history rules above. Reset an individual device's viewing state from Screens & Devices.</p></Card>;
}
