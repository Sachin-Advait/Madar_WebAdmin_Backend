import React,{useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,Plus,Save} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {API} from '../api';
import type {Catalog,Role,TVProfile} from '../types';
import {Button,Card,ErrorBox,FormField,Loading,PageHeading,useFeedback} from '../components/Common';
import {ExperienceSettings,RecommendationSummary,experienceDefaults,type Experience} from '../components/ExperienceSettings';

const empty={id:'',name:'',description:'',profileType:'public',accent:'#6b5837',mode:'light',language:'en',density:'comfortable'};
type FormData=typeof empty;
export default function Profiles({catalog,role}:{catalog:Catalog;role:Role}){
 const {data:items,error,isLoading}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const client=useQueryClient(),feedback=useFeedback();
 const [selection,setSelection]=useState('public'),[newMode,setNewMode]=useState(false);
 const [allowed,setAllowed]=useState<string[]>(['*']),[busy,setBusy]=useState(false);
 const [experience,setExperience]=useState<Experience>(()=>experienceDefaults('public'));
 const {register,handleSubmit,reset,watch}=useForm<FormData>({defaultValues:empty});
 const selected=items?.find(p=>p.id===selection),profileType=watch('profileType');
 useEffect(()=>{
  if(newMode){reset(empty);setAllowed(['*']);setExperience(experienceDefaults('public'));return}
  if(selected){reset({id:selected.id,name:selected.name,description:selected.description,profileType:selected.profileType,accent:String(selected.theme.accent||'#6b5837'),mode:String(selected.theme.mode||'light'),language:String(selected.theme.language||'en'),density:String(selected.theme.density||'comfortable')});setAllowed(selected.allowedSections||['*']);setExperience(experienceDefaults(selected.profileType,selected.experience))}
 },[newMode,selected,reset]);
 async function submit(values:FormData){
  if(!allowed.length){feedback.error(Error('Select at least one accessible page.'));return}
  setBusy(true);
  try{
   const payload:TVProfile={id:values.id.trim().toLowerCase().replace(/\s+/g,'-'),name:values.name,description:values.description,profileType:values.profileType as TVProfile['profileType'],theme:{accent:values.accent,mode:values.mode,language:values.language,density:values.density},allowedSections:allowed,experience};
   if(newMode){await API.createProfile(payload);setSelection(payload.id);setNewMode(false)}else await API.updateProfile(payload.id,payload);
   feedback.success('Display profile published. Assigned screens will receive the updated configuration.');
   await Promise.all([client.invalidateQueries({queryKey:['profiles']}),client.invalidateQueries({queryKey:['recommendation-summary']})]);
  }catch(e){feedback.error(e)}finally{setBusy(false)}
 }
 if(isLoading)return <Loading/>;if(error)return <ErrorBox error={error}/>;
 return <>
  <PageHeading eyebrow="TV EXPERIENCE / DISPLAY ASSIGNMENTS" title="Display Profiles" subtitle="Shape the layout, content and viewing rules for each audience."><Button icon={Plus} disabled={role!=='admin'} onClick={()=>setNewMode(true)}>New profile</Button></PageHeading>
  <div className="two-col-edit">
   <div><Card><div className="card-head"><div><h3>Available profiles</h3><p>Select the profile to edit</p></div></div>
    <div className="profile-list">{(items||[]).map(p=><button className={`profile-choice ${selection===p.id&&!newMode?'selected':''}`} key={p.id} onClick={()=>{setSelection(p.id);setNewMode(false)}}><div className="profile-dot" style={{background:String(p.theme.accent||'#6b5837')}}/><div><strong>{p.name}</strong><small>{p.description}</small></div>{selection===p.id&&!newMode&&<Check size={17}/>}</button>)}</div>
    <div className="panel-hint">Profiles define permitted pages, layout and device history rules. Screen settings can override orientation.</div>
   </Card><RecommendationSummary/></div>
   <Card><div className="card-head"><div><h3>{newMode?'Create display profile':'Profile configuration'}</h3><p>Publishing creates a versioned update for the assigned screens.</p></div></div>
    <form onSubmit={handleSubmit(submit)} className="normal-form"><fieldset disabled={role!=='admin'||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <div className="form-grid"><FormField label="Profile ID"><input {...register('id',{required:true})} readOnly={!newMode} required pattern="[a-z][a-z0-9-]{1,50}" placeholder="e.g. branch-a"/></FormField><FormField label="Profile name"><input {...register('name',{required:true})} minLength={2} maxLength={99} required/></FormField></div>
     <FormField label="Description"><textarea rows={2} {...register('description')}/></FormField>
     <div className="form-grid"><FormField label="Profile type"><select {...register('profileType')}><option value="public">Public / Visitor</option><option value="employee">Employee</option><option value="management">Management</option><option value="vip">VIP Lounge</option><option value="signage">Dedicated Signage</option></select></FormField><FormField label="Interface theme"><select {...register('mode')}><option value="light">Light</option><option value="dark">Dark</option></select></FormField><FormField label="Accent color"><input type="color" {...register('accent')}/></FormField><FormField label="Language"><select {...register('language')}><option value="en">English</option><option value="ar">Arabic</option></select></FormField></div>
     <ExperienceSettings value={experience} onChange={setExperience}/>
     {['public','vip','signage'].includes(profileType)&&experience.historyMode==='device'&&<div className="info-strip">Persistent history is enabled for a shared audience. Resume and interests will be shared by everyone using each assigned device.</div>}
     <div className="access-pages"><strong>Accessible TV pages</strong><label className="checkline"><input type="checkbox" checked={allowed.includes('*')} onChange={e=>setAllowed(e.target.checked?['*']:[])} /> All pages</label><div className="page-allow-list">{Object.entries(catalog.pages).map(([k,name])=><label key={k} className="checkline"><input disabled={allowed.includes('*')} type="checkbox" checked={allowed.includes('*')||allowed.includes(k)} onChange={e=>setAllowed(x=>e.target.checked?[...x,k]:x.filter(a=>a!==k))}/>{name}</label>)}</div></div>
     <div className="form-actions"><Button icon={Save} type="submit" loading={busy}>{newMode?'Create profile':'Publish profile'}</Button></div>
    </fieldset></form>
   </Card>
  </div>{feedback.node}
 </>;
}
