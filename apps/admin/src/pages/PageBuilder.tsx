import React,{useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {DndContext,DragEndEvent,PointerSensor,KeyboardSensor,closestCenter,useSensor,useSensors,useDraggable,useDroppable} from '@dnd-kit/core';
import {SortableContext,arrayMove,sortableKeyboardCoordinates,useSortable,verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import {ChevronDown,Copy,Eye,GripVertical,History,Layers3,Monitor,Plus,Save,Settings2,Trash2,UploadCloud,CheckCircle2} from 'lucide-react';
import {API} from '../api';
import type {Catalog,LayoutSection,PageLayout,Role} from '../types';
import {Button,Card,Empty,ErrorBox,FormField,Loading,PageHeading,Status,useFeedback} from '../components/Common';
import {TVFrame,WidgetCard} from '../components/TVWidgets';

function NewWidget({type,label,onAdd}:{type:string;label:string;onAdd:()=>void}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:`palette:${type}`,data:{type}});
 return <div ref={setNodeRef} className={`palette-widget ${isDragging?'palette-dragging':''}`} style={{transform:CSS.Translate.toString(transform)}}>
  <span className="palette-drag-handle" title="Drag into canvas" {...attributes} {...listeners}><GripVertical size={16}/></span>
  <span className="palette-symbol">▦</span><span className="palette-name">{label}</span><button type="button" className="mini-add" title={`Add ${label}`} onClick={onAdd}><Plus size={17}/></button>
 </div>
}
function SortableSection({section,selected,onSelect,onToggle,onDuplicate,onDelete,readOnly}:{section:LayoutSection;selected:boolean;onSelect:()=>void;onToggle:()=>void;onDuplicate:()=>void;onDelete:()=>void;readOnly:boolean}){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:section.id,disabled:readOnly});
 const style={transform:CSS.Transform.toString(transform),transition};
 return <div ref={setNodeRef} className={`section-editor-card ${selected?'selected':''} ${isDragging?'drag-active':''} ${!section.enabled?'is-disabled':''}`} style={style} onClick={onSelect}>
  <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder"><GripVertical size={19}/></span><div className="section-card-text"><strong>{String(section.props.title||section.type.replaceAll('_',' '))}</strong><small>{section.type} · {section.enabled?'Visible':'Hidden'}</small></div>
  <div className="section-controls"><button title={section.enabled?'Hide':'Show'} disabled={readOnly} onClick={e=>{e.stopPropagation();onToggle()}} className={`small-toggle ${section.enabled?'on':''}`}></button><button title="Duplicate" disabled={readOnly} className="icon-btn" onClick={e=>{e.stopPropagation();onDuplicate()}}><Copy size={15}/></button><button title="Remove" disabled={readOnly} className="icon-btn hover-danger" onClick={e=>{e.stopPropagation();onDelete()}}><Trash2 size={15}/></button></div>
 </div>
}
function CanvasDropZone({children}:{children:React.ReactNode}){
 const {setNodeRef,isOver}=useDroppable({id:'page-canvas'});
 return <div ref={setNodeRef} className={`layout-drop-zone ${isOver?'is-over':''}`}>{children}</div>
}

export default function PageBuilder({catalog,role}:{catalog:Catalog;role:Role}){
 const canEdit=role!=='viewer',canPublish=role==='admin';
 const [page,setPage]=useState('home'),[profile,setProfile]=useState('management');
 const [sections,setSections]=useState<LayoutSection[]>([]);const [selectedId,setSelectedId]=useState<string|null>(null);
 const [dirty,setDirty]=useState(false);const [saving,setSaving]=useState(false);const [versionToRestore,setVersionToRestore]=useState<number|''>('');
 const feedback=useFeedback(); const client=useQueryClient();
 const {data:response,isLoading,error,refetch}=useQuery({queryKey:['layout',page,profile],queryFn:()=>API.layout(page,profile)});
 const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const {data:versions,refetch:reloadVersions}=useQuery({queryKey:['versions',page,profile],queryFn:()=>API.versions(page,profile)});
 const {data:preview}=useQuery({queryKey:['preview',page,profile,'draft'],queryFn:()=>API.preview(page,profile,'draft')});
 useEffect(()=>{if(!response)return;setSections(response.draft.sections.map(s=>({...s,props:{...s.props},layout:{...s.layout}})));setDirty(false);setSelectedId(response.draft.sections[0]?.id||null)},[response]);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const selected=sections.find(s=>s.id===selectedId)||null;
 const allowed=catalog.pageWidgets[page]||[];
 function modify(update:(s:LayoutSection[])=>LayoutSection[]){setSections(current=>update(current).map((s,i)=>({...s,order:i})));setDirty(true)}
 function addWidget(type:string,at?:number){if(!canEdit)return;const info=catalog.widgets[type];if(!info)return;const newItem:LayoutSection={id:`${type}-${crypto.randomUUID().slice(0,8)}`,type,enabled:true,order:sections.length,props:{...info.defaults},layout:{x:0,y:sections.length*4,w:info.grid?6:12,h:4}};modify(old=>{const n=[...old];n.splice(at??n.length,0,newItem);return n});setSelectedId(newItem.id)}
 function dragEnd(event:DragEndEvent){const a=String(event.active.id),over=event.over?.id?String(event.over.id):null;if(!over)return;
  if(a.startsWith('palette:')){const type=a.replace('palette:','');const idx=sections.findIndex(s=>s.id===over);addWidget(type,idx<0?undefined:idx);return}
  const from=sections.findIndex(s=>s.id===a),to=sections.findIndex(s=>s.id===over);
  if(from!==-1&&to!==-1&&from!==to)modify(current=>arrayMove(current,from,to));
 }
 function changeSection(id:string,update:Partial<LayoutSection>){modify(old=>old.map(s=>s.id===id?{...s,...update}:s))}
 async function save(){if(!response)return;setSaving(true);try{const layout:PageLayout={schemaVersion:1,pageKey:page,sections};const result=await API.saveLayout(page,profile,layout,response.revision);feedback.success(`Draft saved • revision ${result.revision}`);await client.invalidateQueries({queryKey:['layout',page,profile]});await client.invalidateQueries({queryKey:['preview',page,profile]});}catch(e){feedback.error(e)}finally{setSaving(false)}}
 async function publish(){if(!response)return;setSaving(true);try{const r=await API.publish(page,profile,response.revision);feedback.success(`Published version ${r.publishedVersion} to ${profile} screens`);await client.invalidateQueries({queryKey:['layout',page,profile]});await client.invalidateQueries({queryKey:['versions',page,profile]});}catch(e){feedback.error(e)}finally{setSaving(false)}}
 async function restore(){if(versionToRestore==='')return;try{await API.rollback(page,profile,Number(versionToRestore),response!.revision);feedback.success('Older version restored to draft. Review and publish when ready.');await client.invalidateQueries({queryKey:['layout',page,profile]});}catch(e){feedback.error(e)}}
 return <><PageHeading eyebrow="TV EXPERIENCE / VISUAL EDITOR" title="Page Builder" subtitle="Arrange sections, configure their appearance, review changes and publish to your screens."><div className="version-display">Published v{response?.publishedVersion||0}</div><Button variant="secondary" icon={Save} loading={saving} disabled={!dirty||!canEdit} onClick={save}>Save draft</Button><Button icon={UploadCloud} loading={saving} disabled={!canPublish||dirty||!response} onClick={publish}>Publish layout</Button></PageHeading>
 <div className="workspace-toolbar"><FormField label="PAGE"><select value={page} onChange={e=>setPage(e.target.value)}>{Object.entries(catalog.pages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></FormField><FormField label="DISPLAY PROFILE"><select value={profile} onChange={e=>setProfile(e.target.value)}>{(profiles||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField><span className="toolbar-stat">{sections.length} sections <b>·</b> {sections.filter(s=>s.enabled).length} visible</span><span className={`dirty-label ${dirty?'is-dirty':''}`}>{dirty?'● Unsaved changes':'✓ Draft saved'}</span></div>
 {error?<ErrorBox error={error}/>:isLoading?<Loading/>:<div className="builder-layout">
  <aside className="panel builder-palette"><div className="panel-header"><h3><Layers3 size={16}/> Widget Library</h3><p>Drag onto the canvas or press +</p></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><div className="palette-list">{allowed.map(type=><NewWidget type={type} key={type} label={catalog.widgets[type]?.label||type} onAdd={()=>addWidget(type)}/>)}</div>
   <div className="panel-hint">Choose from supported display widgets to keep your screens consistent.</div>
   <div className="panel-header second"><h3>Layout canvas</h3><p>Selected page: {catalog.pages[page]}</p></div>
   <CanvasDropZone><SortableContext items={sections.map(s=>s.id)} strategy={verticalListSortingStrategy}><div className="section-sort-list">{sections.map(s=><SortableSection key={s.id} section={s} selected={selectedId===s.id} onSelect={()=>setSelectedId(s.id)} onToggle={()=>changeSection(s.id,{enabled:!s.enabled})} onDuplicate={()=>{const idx=sections.findIndex(x=>x.id===s.id);const item={...s,id:`${s.type}-${crypto.randomUUID().slice(0,8)}`,props:{...s.props}};modify(old=>{const n=[...old];n.splice(idx+1,0,item);return n})}} onDelete={()=>{modify(old=>old.filter(x=>x.id!==s.id));if(selectedId===s.id)setSelectedId(null)}} readOnly={!canEdit}/>)}</div></SortableContext>{!sections.length&&<Empty title="No sections yet" description="Drag a widget from the left, or click its plus button."/>}</CanvasDropZone>
  </DndContext></aside>
  <div className="panel builder-preview"><div className="panel-header inline"><div><h3><Monitor size={17}/> Live TV canvas</h3><p>Illustrative preview • 16:9 TV viewport</p></div><span className="preview-tag">DRAFT</span></div><div className="tv-preview-wrap"><TVFrame page={catalog.pages[page]?.split(' / ')[0]||'Home'} demo={catalog.demo}>{sections.filter(s=>s.enabled).map(s=><div key={s.id} onClick={()=>setSelectedId(s.id)} className={`preview-select ${selectedId===s.id?'is-selected':''}`}><WidgetCard compact section={{...s,source:catalog.widgets[s.type]?.source||'',data:preview?.sections.find(v=>v.id===s.id)?.data ?? (s.type==='info_links'?[]:[])}}/></div>)}</TVFrame></div><div className="canvas-bottom"><p>Layout preview uses the current local arrangement. Data is illustrative until integrations are connected.</p><div className="history-row"><History size={17}/><select value={versionToRestore} onChange={e=>setVersionToRestore(e.target.value?Number(e.target.value):'')}><option value="">Published history</option>{(versions||[]).map(v=><option key={v.version} value={v.version}>v{v.version} – {new Date(v.publishedAt).toLocaleDateString()}</option>)}</select><Button variant="secondary" disabled={versionToRestore===''||!canPublish} onClick={restore}>Restore to draft</Button></div></div></div>
  <aside className="panel builder-properties"><div className="panel-header"><h3><Settings2 size={17}/> Widget Properties</h3><p>{selected?catalog.widgets[selected.type]?.label||selected.type:'Select any section to edit'}</p></div>{selected?<div className="properties-body"><div className="property-meta"><span>COMPONENT TYPE</span><code>{selected.type}</code></div><div className="property-meta"><span>DATA SOURCE</span><code>{catalog.widgets[selected.type]?.source}</code></div><div className="property-meta"><span>FLUTTER WIDGET ID</span><code>{selected.id}</code></div><div className="props-form"><Form schema={catalog.widgets[selected.type]?.schema||{type:'object'}} validator={validator} disabled={!canEdit} formData={selected.props} onChange={e=>changeSection(selected.id,{props:e.formData as Record<string,unknown>})} onSubmit={e=>changeSection(selected.id,{props:e.formData as Record<string,unknown>})} showErrorList={false}><></></Form></div><div className="properties-note">Widget settings are checked again by the API before saving. Publishing requires Admin permission.</div></div>:<Empty title="Select a widget" description="Choose a section from the canvas to edit its properties."/>}</aside>
 </div>}{feedback.node}</>
}
