import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Fullscreen,MonitorPlay,RefreshCw} from 'lucide-react';
import {API} from '../api';
import type {Catalog} from '../types';
import {Button,Card,Empty,ErrorBox,FormField,Loading,PageHeading,Status} from '../components/Common';
import {TVFrame,WidgetCard} from '../components/TVWidgets';

export default function Preview({catalog}:{catalog:Catalog}){
 const [page,setPage]=useState('home'),[profile,setProfile]=useState('management'),[mode,setMode]=useState<'draft'|'published'>('published');
 const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const {data,error,isLoading,refetch,isFetching}=useQuery({queryKey:['preview',page,profile,mode],queryFn:()=>API.preview(page,profile,mode)});
 return <><PageHeading eyebrow="TV EXPERIENCE / DISPLAY PREVIEW" title="TV Preview" subtitle="Inspect draft or published content by screen profile before deploying it to TVs."><Button variant="secondary" icon={RefreshCw} onClick={()=>refetch()} loading={isFetching}>Refresh preview</Button></PageHeading>
 <div className="workspace-toolbar"><FormField label="PAGE"><select value={page} onChange={e=>setPage(e.target.value)}>{Object.entries(catalog.pages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></FormField><FormField label="DISPLAY PROFILE"><select value={profile} onChange={e=>setProfile(e.target.value)}>{(profiles||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField><FormField label="LAYOUT STATE"><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="draft">Saved draft</option><option value="published">Published</option></select></FormField><span className="toolbar-stat">1920 × 1080 simulation</span></div>
 {isLoading?<Loading/>:error?<ErrorBox error={error}/>:data?<div className="preview-stage"><div className="preview-stage-head"><strong><MonitorPlay size={18}/> TV presentation preview</strong><span><Status value={mode==='draft'?'Draft':'Published'}/>{data.sections.length} visible sections</span></div><TVFrame page={catalog.pages[page]?.split(' / ')[0]||'Home'} demo={catalog.demo}>{data.sections.length?data.sections.map(s=><WidgetCard key={s.id} section={s}/>):<Empty title="No visible sections on this layout"/>}</TVFrame><div className="preview-foot"><span>Profile: {profile} · {data.generatedAt?new Date(data.generatedAt).toLocaleString():''}</span><span>{catalog.demo?'Illustrative sample data; not connected to live systems':'Live provider data subject to integration'}</span></div></div>:null}
 <div className="info-strip">The React preview approximates the TV layout for administration. The final pixel-perfect renderer remains Flutter; test focus navigation and real playback on a physical Android TV device before rollout.</div></>
}
