import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {BrainCircuit,Monitor,PanelLeft,ShieldCheck} from 'lucide-react';
import {request} from '../api';
import {Card,ErrorBox,FormField,Loading} from './Common';
import './experience-settings.css';

export type HubGroup={id:string;title:string;titleAr:string;pages:string[]};
export type Experience={orientation:'auto'|'landscape'|'portrait';historyMode:'off'|'session'|'device';recommendations:boolean;completionThreshold:number;hubGroups:HubGroup[]};
export const hubPageNames:Record<string,string>={'info-meetings':'Meetings','info-queue':'Queue','info-notices':'Notices','info-alerts':'Priority alerts','info-services':'Services & information','info-visitor':'Visitor guide','info-events':'Events & training','info-media':'Media highlights'};
export const defaultGroups:HubGroup[]=[
 {id:'glance',title:'At a glance',titleAr:'نظرة سريعة',pages:['info-meetings','info-queue']},
 {id:'updates',title:'Updates',titleAr:'المستجدات',pages:['info-notices','info-alerts']},
 {id:'services',title:'Services',titleAr:'الخدمات',pages:['info-services','info-visitor']},
 {id:'explore',title:'Explore',titleAr:'استكشف',pages:['info-events','info-media']},
];
export function experienceDefaults(profileType:string,value?:Partial<Experience>):Experience{
 const persistent=['employee','management'].includes(profileType);
 return {orientation:'auto',historyMode:persistent?'device':'off',recommendations:true,completionThreshold:.95,...value,hubGroups:value?.hubGroups?.length===4?structuredClone(value.hubGroups):structuredClone(defaultGroups)};
}
export function ExperienceSettings({value,onChange,disabled=false}:{value:Experience;onChange:(value:Experience)=>void;disabled?:boolean}){
 function patch<K extends keyof Experience>(key:K,next:Experience[K]){onChange({...value,[key]:next})}
 function group(index:number,next:Partial<HubGroup>){patch('hubGroups',value.hubGroups.map((g,i)=>i===index?{...g,...next}:g))}
 function page(index:number,slot:number,next:string){
  const groups=structuredClone(value.hubGroups),previous=groups[index].pages[slot];
  // Move the selected section into this slot, preserving one occurrence of every section.
  for(let i=0;i<groups.length;i++)for(let j=0;j<groups[i].pages.length;j++)if(groups[i].pages[j]===next)groups[i].pages[j]=previous;
  groups[index].pages[slot]=next;patch('hubGroups',groups);
 }
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
  <h4 className="experience-section-title"><PanelLeft size={17}/> Info Hub: four tabs, two sections each</h4>
  <p className="experience-note">Each tab opens directly onto its two sections. Changing a section swaps it with its previous slot. Audience permissions still apply; priority full-screen alerts remain independent of the selected tab.</p>
  <div className="hub-group-editor">{value.hubGroups.map((g,index)=><div className="hub-group-row" key={g.id}>
   <span className="hub-group-number">0{index+1}</span>
   <div className="form-grid"><FormField label="Tab title"><input maxLength={50} required value={g.title} onChange={e=>group(index,{title:e.target.value})}/></FormField><FormField label="Arabic title"><input dir="rtl" maxLength={50} value={g.titleAr} onChange={e=>group(index,{titleAr:e.target.value})}/></FormField>
   {g.pages.map((p,slot)=><FormField key={slot} label={`Section ${slot+1}`}><select value={p} onChange={e=>page(index,slot,e.target.value)}>{Object.entries(hubPageNames).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></FormField>)}</div>
  </div>)}</div>
 </fieldset>;
}

export function RecommendationSummary(){
 const query=useQuery<any>({queryKey:['recommendation-summary'],queryFn:()=>request('/api/admin/recommendation-summary')});
 return <Card className="recommendation-summary"><div className="card-head"><div><h3><BrainCircuit size={18}/> Device recommendations</h3><p>A small, explainable interest model for the content already in your catalogue.</p></div></div>
 {query.isLoading?<Loading/>:query.error?<ErrorBox error={query.error}/>:<><div className="experience-note">Viewing completion and favourites inform category, language and tag preferences. Recent signals carry more weight; new devices start with editorial content.</div><dl className="recommendation-facts"><div><dt>Model</dt><dd>{query.data?.model||'Content-based device interests'}</dd></div><div><dt>Persistent devices</dt><dd>{query.data?.devices?.persistent??0} / {query.data?.devices?.total??0}</dd></div><div><dt>History retained</dt><dd>{query.data?.retentionDays??90} days</dd></div><div><dt>History disabled</dt><dd>{query.data?.devices?.off??0} devices</dd></div><div><dt>Session only</dt><dd>{query.data?.devices?.session??0} devices</dd></div><div><dt>Devices with history</dt><dd>{query.data?.stored?.devicesWithHistory??0}</dd></div></dl><div className="experience-note">{query.data?.algorithm||'Explainable content-based interest ranking'}. When history is off or session-only, server recommendations use editorial content. {query.data?.externalAi===false?'No external AI service is used.':''}</div></>}
 <p className="experience-note">Change learning and history rules above. Reset an individual device's viewing state from Screens & Devices.</p></Card>;
}
