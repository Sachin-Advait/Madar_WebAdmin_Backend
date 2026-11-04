import React,{useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import ReactGridLayout,{useContainerWidth,verticalCompactor} from 'react-grid-layout';
import Form from '@rjsf/core';
import validator from '../form-validator';
import {Grip,LayoutGrid,Plus,Save,Trash2,UploadCloud} from 'lucide-react';
import {API} from '../api';
import type {Catalog,LayoutSection,PageLayout,Role} from '../types';
import {Button,Empty,ErrorBox,FormField,Loading,PageHeading,useFeedback} from '../components/Common';
import {WidgetCard} from '../components/TVWidgets';

const DASHBOARD_PAGES=['home','info-hub','info-meetings','info-queue'];
export default function DashboardBuilder({catalog,role}:{catalog:Catalog;role:Role}){
 const [page,setPage]=useState('info-hub');const [profile,setProfile]=useState('management');const [sections,setSections]=useState<LayoutSection[]>([]);const [selectedId,setSelectedId]=useState<string|null>(null);const [dirty,setDirty]=useState(false);const [working,setWorking]=useState(false);
 const canEdit=role!=='viewer';const canPublish=role==='admin';const feedback=useFeedback();const client=useQueryClient();
 const {width,containerRef}=useContainerWidth();
 const {data:res,error,isLoading}=useQuery({queryKey:['layout',page,profile],queryFn:()=>API.layout(page,profile)});
 const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const {data:preview}=useQuery({queryKey:['preview',page,profile,'draft'],queryFn:()=>API.preview(page,profile,'draft')});
 useEffect(()=>{if(!res)return;setSections(res.draft.sections.map(s=>({...s,layout:{...s.layout},props:{...s.props}})));setSelectedId(res.draft.sections[0]?.id||null);setDirty(false)},[res]);
 const selected=sections.find(s=>s.id===selectedId)||null;
 const grid=sections.filter(s=>s.enabled && catalog.widgets[s.type]?.grid);
 const layouts=grid.map(s=>({i:s.id,...s.layout,minW:3,minH:2,maxW:12}));
 function updateSection(id:string,patch:Partial<LayoutSection>){setSections(old=>old.map(s=>s.id===id?{...s,...patch}:s));setDirty(true)}
 function add(type:string){const info=catalog.widgets[type];const id=`${type}-${crypto.randomUUID().slice(0,8)}`;const item:LayoutSection={id,type,enabled:true,order:sections.length,props:{...info.defaults},layout:{x:0,y:sections.length*4,w:6,h:4}};setSections(s=>[...s,item]);setSelectedId(id);setDirty(true)}
 function onGridChange(next:ReadonlyArray<any>){setSections(old=>{
   let changed=false;
   const result=old.map(s=>{const n=next.find(x=>x.i===s.id);if(!n)return s;const loc={x:n.x,y:n.y,w:n.w,h:n.h};if(JSON.stringify(s.layout)===JSON.stringify(loc))return s;changed=true;return {...s,layout:loc}});
   if(changed)setDirty(true);
   return changed?result:old;
 })}
 async function save(){if(!res)return;setWorking(true);try{await API.saveLayout(page,profile,{schemaVersion:1,pageKey:page,sections},res.revision);feedback.success('Dashboard grid saved as draft');await client.invalidateQueries({queryKey:['layout',page,profile]});await client.invalidateQueries({queryKey:['preview',page,profile]})}catch(e){feedback.error(e)}finally{setWorking(false)}}
 async function publish(){if(!res)return;setWorking(true);try{const out=await API.publish(page,profile,res.revision);feedback.success(`Dashboard published • version ${out.publishedVersion}`);await client.invalidateQueries({queryKey:['layout',page,profile]})}catch(e){feedback.error(e)}finally{setWorking(false)}}
 return <><PageHeading eyebrow="TV EXPERIENCE / DYNAMIC KPI LAYOUTS" title="Dashboard Designer" subtitle="Arrange and resize operational widgets on a 12-column TV grid."><span className="version-display">Published v{res?.publishedVersion||0}</span><Button variant="secondary" icon={Save} onClick={save} loading={working} disabled={!dirty||!canEdit}>Save draft</Button><Button icon={UploadCloud} onClick={publish} loading={working} disabled={!canPublish||dirty||!res}>Publish</Button></PageHeading>
 <div className="workspace-toolbar"><FormField label="DASHBOARD"><select value={page} onChange={e=>setPage(e.target.value)}>{DASHBOARD_PAGES.map(p=><option key={p} value={p}>{catalog.pages[p]}</option>)}</select></FormField><FormField label="TV PROFILE"><select value={profile} onChange={e=>setProfile(e.target.value)}>{(profiles||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField><div className="toolbar-stat">Drag the card header to move · resize from the bottom-right</div><span className={`dirty-label ${dirty?'is-dirty':''}`}>{dirty?'● Unsaved changes':'✓ Draft saved'}</span></div>
 {error?<ErrorBox error={error}/>:isLoading?<Loading/>:<div className="dashboard-editor"><div className="panel widget-toolbox"><div className="panel-header"><h3>Available KPI widgets</h3><p>Click to add to the current grid</p></div>{(catalog.pageWidgets[page]||[]).filter(w=>catalog.widgets[w]?.grid).map(t=><button disabled={!canEdit} key={t} className="toolbox-item" onClick={()=>add(t)}><Plus size={15}/>{catalog.widgets[t].label}</button>)}<div className="panel-hint">Only pre-approved KPI widgets can be added. Widget values are supplied by the backend integration.</div></div>
  <div className="panel grid-editor-panel"><div className="panel-header inline"><div><h3><LayoutGrid size={16}/> Layout canvas</h3><p>TV ratio preview · twelve columns</p></div><span className="preview-tag">LIVE GRID</span></div><div className="grid-wrap" ref={containerRef}>
   <ReactGridLayout width={Math.max(width,400)} layout={layouts} onLayoutChange={onGridChange}
    gridConfig={{cols:12,rowHeight:55,margin:[12,12],containerPadding:[12,12]}}
    dragConfig={{enabled:canEdit,handle:'.widget-handle',bounded:true}}
    resizeConfig={{enabled:canEdit,handles:['se']}} compactor={verticalCompactor}>
    {grid.map(s=><div key={s.id} className={`rgl-card ${selectedId===s.id?'rgl-selected':''}`}>
     <div className="widget-handle" onClick={()=>setSelectedId(s.id)}><Grip size={16}/> {String(s.props.title||catalog.widgets[s.type].label)} <button className="icon-btn hover-danger" disabled={!canEdit} onClick={e=>{e.stopPropagation();setSections(a=>a.filter(x=>x.id!==s.id));setDirty(true)}} title="Remove widget"><Trash2 size={14}/></button></div>
     <WidgetCard compact section={{...s,source:catalog.widgets[s.type].source,data:preview?.sections.find(v=>v.id===s.id)?.data||{}}}/>
    </div>)}
   </ReactGridLayout>{!grid.length&&<Empty title="No dashboard widgets" description="Add a KPI widget from the left to begin."/>}</div></div>
  <aside className="panel builder-properties"><div className="panel-header"><h3>Selected widget</h3><p>{selected?catalog.widgets[selected.type]?.label:'Select a widget from the grid'}</p></div>{selected?<div className="properties-body"><div className="property-meta"><span>COMPONENT</span><code>{selected.type}</code></div><Form schema={catalog.widgets[selected.type].schema} validator={validator} formData={selected.props} disabled={!canEdit} onChange={e=>updateSection(selected.id,{props:e.formData as Record<string,unknown>})}><></></Form><div className="properties-note">Changes apply only to this widget. Use Save draft, then Publish.</div></div>:<Empty title="Select a widget"/>}</aside>
 </div>}{feedback.node}</>
}
