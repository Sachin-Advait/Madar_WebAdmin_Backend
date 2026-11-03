import React,{useState} from 'react';
import BannerEditor,{bannerUiSchema} from '../components/BannerEditor';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import {ArrowLeft,ArrowUpRight,FileImage,Filter,ImagePlus,MoreHorizontal,Plus,Search,Trash2,UploadCloud} from 'lucide-react';
import {API,request} from '../api';
import type {Catalog,Resource,Role} from '../types';
import {Button,Card,Empty,ErrorBox,Loading,PageHeading,Status,useFeedback} from '../components/Common';

const descriptions:Record<string,string>={
 channels:'Manage channel metadata, logos, EPG mappings and streaming references.',videos:'Curate video-on-demand content that the existing Flutter TV app can display.',
 replay:'Configure the Catch-Up sources supported by your TV provider. Personal recordings are excluded.',
 radio:'Manage listening stations, artwork, categories and stream references.',
 featured:'Select and prioritize existing content for Home hero banners.',
 notices:'Create scheduled bilingual notices and organizational messages.',
 events:'Manage conferences, workshops, seminars and training schedules.',
 services:'Configure generic service information, guidance and digital links.',
 visitor:'Manage directory entries, floors, directions and opening hours.',
 media:'Publish highlights, image collections and links to existing videos.',
 alerts:'Manage priority alerts, validity periods and authorized full-screen overrides.'};

export default function ContentManager({kind,catalog,role}:{kind:string;catalog:Catalog;role:Role}){
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<Resource|null>(null),[create,setCreate]=useState(false);
 const [draft,setDraft]=useState<Record<string,unknown>>({});const [statusFilter,setStatusFilter]=useState('all');const [busy,setBusy]=useState(false);
 const {data:items,isLoading,error}=useQuery({queryKey:['resources',kind],queryFn:()=>API.resources(kind)});
 const client=useQueryClient();const feedback=useFeedback();const canEdit=role!=='viewer';
 const needsLinks=['featured','events','replay','media','programmes'].includes(kind);
 const {data:videoOptions}=useQuery({queryKey:['resources','videos'],queryFn:()=>API.resources('videos'),enabled:needsLinks});
 const {data:channelOptions}=useQuery({queryKey:['resources','channels'],queryFn:()=>API.resources('channels'),enabled:needsLinks});
 const {data:eventOptions}=useQuery({queryKey:['resources','events'],queryFn:()=>API.resources('events'),enabled:kind==='featured'});
 const {data:noticeOptions}=useQuery({queryKey:['resources','notices'],queryFn:()=>API.resources('notices'),enabled:kind==='featured'});
 const {data:masters={}}=useQuery<Record<string,any[]>>({queryKey:['masters','content-options'],queryFn:async()=>Object.fromEntries(await Promise.all(['categories','departments','locations','rooms','counters','languages','buildings'].map(async k=>[k,await request('/api/admin/masters/'+k)])))});
 const editorSchema=structuredClone(catalog.resourceSchemas[kind]||{type:'object',properties:{}});
 for(const [field,master,valueKey] of [['locationId','locations','id'],['roomId','rooms','id'],['counterId','counters','id'],['owner','departments','name'],['category','categories','name'],['department','departments','name'],['language','languages','code'],['building','buildings','name']])if(editorSchema.properties[field]&&masters[master]?.length){const list=masters[master].filter((m:any)=>(m.active||m[valueKey]===draft[field])&&(!m.resourceKind||m.resourceKind===kind));editorSchema.properties[field].oneOf=[{const:'',title:'Choose…'},...list.map((m:any)=>({const:m[valueKey],title:m.name}))].filter((m:any,i:number,all:any[])=>all.findIndex(x=>x.const===m.const)===i);if(draft[field]&&!list.some((m:any)=>m[valueKey]===draft[field]))editorSchema.properties[field].oneOf.push({const:draft[field],title:String(draft[field])});}
 const linkChoice=(rows:Resource[]|undefined)=>[{const:'',title:'Choose existing content…'},...(rows||[]).map(row=>({const:row.id,title:row.title}))];
 if(kind==='programmes')editorSchema.properties.channelId.oneOf=linkChoice(channelOptions);
 if(kind==='featured'){
   const target=String(draft.targetType||'video');
   const ref=target==='channel'?linkChoice(channelOptions):target==='event'?linkChoice(eventOptions):target==='notice'?linkChoice(noticeOptions):target==='info-page'?[{const:'',title:'Choose page…'},...Object.entries(catalog.pages).filter(([k])=>k.startsWith('info-')).map(([k,v])=>({const:k,title:v}))]:linkChoice(videoOptions);
   editorSchema.properties.targetId={type:'string',title:'Select existing '+target+' item',oneOf:ref};
 }
 if(kind==='replay')editorSchema.properties.channelId={type:'string',title:'Catch-Up enabled channel',oneOf:linkChoice(channelOptions)};
 if(kind==='events')editorSchema.properties.videoId={type:'string',title:'Related published video',oneOf:linkChoice(videoOptions)};
 if(kind==='media')editorSchema.properties.targetVideoId={type:'string',title:'Related published video',oneOf:linkChoice(videoOptions)};

 if(role==='editor')editorSchema.properties.status.enum=['draft','review'];
 const label=catalog.resources[kind]?.label||kind;
 function startNew(){setDraft({title:'',titleAr:'',description:'',category:'',status:'draft',sortOrder:0,visibleTo:['public','employee','management','vip','signage']});setEditing(null);setCreate(true)}
 function startEdit(item:Resource){const {id,createdAt,updatedAt,revision,publishedStatus,...values}=item;setDraft(role==='editor'?{...values,status:'draft'}:values);setEditing(item);setCreate(true)}
 function cancel(){setCreate(false);setEditing(null)}
 async function save(values:Record<string,unknown>){setBusy(true);try{if(editing){await API.updateResource(kind,editing.id,{...values,revision:editing.revision});feedback.success(`${label} item updated`)}else{await API.addResource(kind,values);feedback.success(`${label} item created`)}await client.invalidateQueries({queryKey:['resources',kind]});await client.invalidateQueries({queryKey:['overview']});cancel()}catch(e){feedback.error(e)}finally{setBusy(false)}}
 async function deleteItem(item:Resource){if(!window.confirm(`Delete "${item.title}"? This cannot be undone.`))return;try{await API.deleteResource(kind,item.id);feedback.success('Content item deleted');await client.invalidateQueries({queryKey:['resources',kind]})}catch(e){feedback.error(e)}}
 async function importItems(file:File){try{if(file.size>900000)throw Error('JSON imports must be under 900 KB');const parsed=JSON.parse(await file.text());const r=await request('/api/admin/resources/'+kind+'/import',{method:'POST',body:JSON.stringify({items:Array.isArray(parsed)?parsed:parsed.items})});feedback.success(r.count+' items imported');await client.invalidateQueries({queryKey:['resources',kind]})}catch(e){feedback.error(e)}}
 async function uploadField(file:File,field:string){setBusy(true);try{const result=await API.uploadAsset(file);setDraft(d=>({...d,[field]:result.url}));feedback.success('File uploaded. Save the content item to publish it.')}catch(e){feedback.error(e)}finally{setBusy(false)}}
 async function upload(file:File){await uploadField(file,'image')}
 const filtered=(items||[]).filter(v=>(statusFilter==='all'||v.status===statusFilter)&&((v.title||'')+' '+(v.category||'')+' '+(v.description||'')).toLowerCase().includes(search.toLowerCase()));
 if(create)return <><PageHeading eyebrow={`CONTENT / ${label.toUpperCase()}`} title={editing?'Edit content':'Create content'} subtitle={`Configure information for ${label.toLowerCase()} without duplicating it in Home.`}><Button variant="secondary" icon={ArrowLeft} onClick={cancel}>Back to list</Button></PageHeading>
 <div className="content-form-layout"><Card><div className="card-head"><div><h3>{editing?'Edit published data':'New content item'}</h3><p>Save a draft, submit for review, or publish to the selected audiences.</p></div></div>
 <Form schema={editorSchema} validator={validator} formData={draft} onChange={e=>setDraft(e.formData as Record<string,unknown>)} onSubmit={e=>save(e.formData as Record<string,unknown>)} disabled={!canEdit||busy} showErrorList={false} uiSchema={{description:{'ui:widget':'textarea'},requirements:{'ui:widget':'textarea'},visibleTo:{'ui:widget':'checkboxes'},...(editorSchema.properties.bannerMode?bannerUiSchema:{})}}>
 <div className="form-actions"><Button type="button" variant="secondary" onClick={cancel}>Cancel</Button><Button type="submit" loading={busy} disabled={!canEdit}><UploadCloud size={16}/> Save content</Button></div>
 </Form></Card>
 <aside className="panel content-artwork"><div className="panel-header"><h3>Artwork / poster</h3><p>PNG, JPEG or WebP • up to 10 MB</p></div><div className="artwork-area">{typeof draft.image==='string'&&draft.image?<img src={draft.image} alt="Current artwork"/>:<div className="artwork-empty"><FileImage size={33}/><span>No artwork uploaded</span></div>}</div><label className="upload-button"><ImagePlus size={18}/> Upload image <input hidden type="file" disabled={!canEdit||busy} accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/></label>{['attachmentUrl','videoRef','stationRef'].filter(k=>editorSchema.properties[k]).map(k=><label className="file-field-upload" key={k}>Upload {k==='attachmentUrl'?'PDF attachment':k==='videoRef'?'MP4 video':'MP3 audio'}<input type="file" disabled={!canEdit||busy} accept={k==='attachmentUrl'?'application/pdf':k==='videoRef'?'video/mp4':'audio/mpeg'} onChange={e=>{const f=e.target.files?.[0];if(f)uploadField(f,k)}}/></label>)}<div className="panel-hint">Artwork uploads are verified and stored by the MADAR API. Existing production storage can be connected through the same endpoint.</div>{editorSchema.properties.bannerMode&&<BannerEditor draft={draft} onChange={setDraft} onUpload={uploadField} disabled={!canEdit||busy}/>}</aside></div>{feedback.node}</>;
 return <><PageHeading eyebrow="CONTENT MANAGEMENT" title={label} subtitle={descriptions[kind]||'Manage content catalog.'}><Button icon={Plus} onClick={startNew} disabled={!canEdit}>Add {label.endsWith('s')?'item':'new item'}</Button></PageHeading>
 <div className="bulk-upload"><label>Import up to 100 content records from a JSON array <input type="file" accept="application/json,.json" disabled={!canEdit} onChange={e=>{const f=e.target.files?.[0];if(f)importItems(f)}}/></label></div><Card className="content-list-card"><div className="list-toolbar"><div className="searchbox"><Search size={17}/><input placeholder={`Search ${label.toLowerCase()}…`} value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="select-wrap"><Filter size={16}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="review">Awaiting approval</option><option value="disabled">Disabled</option></select></div><span className="total-count">{filtered.length} items</span></div>
 {isLoading?<Loading/>:error?<ErrorBox error={error}/>:filtered.length?<div className="responsive-table"><table className="table"><thead><tr><th>CONTENT</th><th>CATEGORY</th><th>STATUS</th><th>VISIBILITY</th><th>UPDATED</th><th></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><div className="content-name"><div className="table-thumb">{item.image?<img src={item.image} alt=""/>:<FileImage size={18}/>}</div><div><strong>{item.title}</strong><small>{item.description||'No description'}</small></div></div></td><td>{item.category||'—'}</td><td><Status value={item.status}/></td><td><span className="table-muted">{item.visibleTo?.length??0} profiles</span></td><td><span className="table-muted">{item.updatedAt?new Date(item.updatedAt).toLocaleDateString():'—'}</span></td><td><div className="action-cell"><button className="row-action" onClick={()=>startEdit(item)}>Edit <ArrowUpRight size={14}/></button><button className="icon-btn hover-danger" title="Delete" disabled={!canEdit} onClick={()=>deleteItem(item)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>:<Empty title="No matching content" description="Add an item or change your search filters."/>}
 </Card>{kind==='replay'&&<div className="info-strip"><strong>Catch-Up only:</strong>&nbsp; Provider-supported replay and retention controls; no personal PVR, recording scheduler or recording buttons.</div>}{feedback.node}</>
}

