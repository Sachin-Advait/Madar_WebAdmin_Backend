import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Maximize2} from 'lucide-react';
import {API} from '../api';
import type {Catalog} from '../types';
import {PageHeading,Loading,ErrorBox,Button} from '../components/Common';
import TVExperience from '../components/TVExperience';
export default function TVPreview({catalog}:{catalog:Catalog}){
 const [profile,setProfile]=useState('public'),[mode,setMode]=useState<'draft'|'published'>('published'),[expanded,setExpanded]=useState(false);
 const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const q=useQuery({queryKey:['full-preview',profile,mode],queryFn:async()=>{const p=(await API.profiles()).find(x=>x.id===profile)!;const pages=Object.keys(catalog.pages).filter(k=>p.allowedSections.includes('*')||p.allowedSections.includes(k));const [ls,cs,ops]=await Promise.all([Promise.all(pages.map(k=>API.layout(k,profile))),Promise.all(Object.keys(catalog.resources).map(async k=>[k,await API.resources(k,'',mode==='published')] as const)),API.preview(pages.includes('info-hub')?'info-hub':pages[0],profile,mode)]);return {bundle:{displayFields:Object.fromEntries(Object.entries((catalog as any).fieldDefinitions||{}).map(([k,d]:any)=>[k,d.fields.filter((f:any)=>f.showOnTv)])),releaseId:profile+'-'+mode+'-'+Date.now(),profile:p,pages:Object.fromEntries(ls.map(l=>[l.pageKey,mode==='draft'?l.draft:l.published])),content:Object.fromEntries(cs.map(([k,list])=>[k,list.filter(r=>r.visibleTo?.includes(p.profileType))]))},operations:Object.fromEntries(ops.sections.filter(s=>['meeting','queue'].includes(s.source)).map(s=>[s.source,s.data]))}}});
 return <div className={expanded?'expanded-tv-preview':''}><PageHeading eyebrow="THE VIEW FROM YOUR SCREEN" title="TV experience" subtitle="Explore all six destinations and eight Info Hub sections."><select aria-label="Preview profile" value={profile} onChange={e=>setProfile(e.target.value)}>{profiles?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Preview publication" value={mode} onChange={e=>setMode(e.target.value as any)}><option value="published">Published layouts</option><option value="draft">Draft layouts</option></select><Button variant="secondary" icon={Maximize2} onClick={()=>setExpanded(!expanded)}>{expanded?'Exit fullscreen':'Expand preview'}</Button></PageHeading>{q.isLoading?<Loading/>:q.error?<ErrorBox error={q.error}/>:q.data&&<TVExperience key={profile+mode} bundle={q.data.bundle} operations={q.data.operations} demo={catalog.demo}/>}</div>
}
