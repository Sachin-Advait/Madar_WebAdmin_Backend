import Pairing from '../components/Pairing';
import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Airplay,Copy,KeyRound,Monitor,Plus,RotateCcw,Save,ShieldCheck} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {API,request} from '../api';
import type {Catalog,Role,Screen} from '../types';
import {Button,Card,Empty,ErrorBox,FormField,Loading,PageHeading,Status,useFeedback} from '../components/Common';
import '../components/experience-settings.css';

type ScreenForm={name:string;profileId:string;location:string;groupName:string;assignedPage:string;enabled:boolean;orientationOverride:'inherit'|'auto'|'landscape'|'portrait'};
const initial:ScreenForm={name:'',profileId:'public',location:'',groupName:'',assignedPage:'home',enabled:true,orientationOverride:'inherit'};
const values=(screen:Screen):ScreenForm=>({name:screen.name,profileId:screen.profileId,location:screen.location,groupName:screen.groupName,assignedPage:screen.assignedPage,enabled:screen.enabled,orientationOverride:screen.orientationOverride||'inherit'});
export default function Screens({catalog,role}:{catalog:Catalog;role:Role}){
 const {data:screens,isLoading,error}=useQuery({queryKey:['screens'],queryFn:API.screens});
 const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});
 const {data:masters={}}=useQuery<Record<string,any[]>>({queryKey:['masters','screen-options'],queryFn:async()=>Object.fromEntries(await Promise.all(['locations','groups'].map(async k=>[k,await request('/api/admin/masters/'+k)])))});
 const [editing,setEditing]=useState<string|null>(null),[open,setOpen]=useState(false),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[resetting,setResetting]=useState(false);
 const modalRef=useRef<HTMLDivElement>(null);
 const {register,handleSubmit,reset}=useForm<ScreenForm>({defaultValues:initial});
 const feedback=useFeedback(),client=useQueryClient();
 function edit(screen:Screen){setEditing(screen.id);reset(values(screen));setOpen(true);setSecret('')}
 function create(){setEditing(null);reset(initial);setSecret('');setOpen(true)}
 function close(){setOpen(false);setSecret('')}
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement as HTMLElement|null;
  const focusables=()=>Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')||[]).filter(el=>el.getClientRects().length>0&&!el.closest('fieldset:disabled'));
  const first=focusables()[0];first?.focus();
  function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();setOpen(false);setSecret('')}else if(event.key==='Tab'){const items=focusables(),first=items[0],last=items.at(-1);if(!first){event.preventDefault();return}if(event.shiftKey&&(document.activeElement===first||!modalRef.current?.contains(document.activeElement))){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||!modalRef.current?.contains(document.activeElement))){event.preventDefault();first.focus()}}}
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()};
 },[open]);
 async function submit(payload:ScreenForm){
  setBusy(true);try{
   if(editing){await API.updateScreen(editing,payload);feedback.success('Screen updated')}else{const result=await API.createScreen(payload);setSecret(result.screenKey);setEditing(result.id||null);feedback.success('Screen registered. Copy the generated device credential now.')}
   await client.invalidateQueries({queryKey:['screens']});if(editing)close();
  }catch(e){feedback.error(e)}finally{setBusy(false)}
 }
 async function rotate(id:string){
  if(!window.confirm('Rotate the screen credential? The previous credential will stop working immediately.'))return;
  setBusy(true);try{const r=await API.rotateKey(id),active=screens?.find(screen=>screen.id===id);if(active)reset(values(active));setSecret(r.screenKey);setOpen(true);setEditing(id);feedback.success('Credential rotated. Copy the new key now.')}
  catch(e){feedback.error(e)}finally{setBusy(false)}
 }
 async function resetPreferences(){
  if(!editing||!window.confirm('Clear this device’s saved viewing progress, recommendation history and favourites? This applies to everyone who uses this screen.'))return;
  setResetting(true);try{await request('/api/admin/screens/'+editing+'/preferences',{method:'DELETE'});await client.invalidateQueries({queryKey:['recommendation-summary']});feedback.success('Device history and favourites reset. The TV will refresh its state on the next connection.')}catch(e){feedback.error(e)}finally{setResetting(false)}
 }
 const online=(s:Screen)=>!!s.lastSeen&&(Date.now()-Date.parse(s.lastSeen))<2*60_000;
 return <>
  <PageHeading eyebrow="TV EXPERIENCE / DEVICE OPERATIONS" title="Screens & Devices" subtitle="Register TV endpoints, assign display profiles and manage device access."><Button icon={Plus} disabled={role!=='admin'} onClick={create}>Register TV screen</Button></PageHeading>
  <Pairing role={role}/>
  <div className="kpi-grid mini"><div className="kpi-card"><Monitor size={22}/><span>Registered screens</span><strong>{screens?.length||0}</strong></div><div className="kpi-card"><Airplay size={22}/><span>Recently connected</span><strong>{screens?.filter(online).length||0}</strong></div><div className="kpi-card"><ShieldCheck size={22}/><span>Enabled screens</span><strong>{screens?.filter(s=>s.enabled).length||0}</strong></div></div>
  <Card><div className="card-head"><div><h3>Device inventory</h3><p>Online means a heartbeat has arrived in the last 2 minutes.</p></div></div>
   {isLoading?<Loading/>:error?<ErrorBox error={error}/>:screens?.length?<div className="responsive-table"><table className="table"><thead><tr><th>SCREEN</th><th>LOCATION / GROUP</th><th>DISPLAY PROFILE</th><th>LAYOUT / START PAGE</th><th>HEARTBEAT</th><th></th></tr></thead><tbody>{screens.map(s=><tr key={s.id}><td><div className="content-name"><div className="table-thumb"><Monitor size={18}/></div><div><strong>{s.name}</strong><small>{s.id.slice(0,15)}</small></div></div></td><td><strong>{s.location||'—'}</strong><br/><span className="table-muted">{s.groupName}</span></td><td>{profiles?.find(p=>p.id===s.profileId)?.name||s.profileId}</td><td>{s.orientationOverride&&s.orientationOverride!=='inherit'?s.orientationOverride:'Profile default'}<br/><span className="table-muted">{catalog.pages[s.assignedPage]||s.assignedPage}</span></td><td><Status value={!s.enabled?'Disabled':online(s)?'Online':'Offline'}/><br/><span className="table-muted">{s.lastSeen?new Date(s.lastSeen).toLocaleString():'Never connected'}</span></td><td><div className="action-cell"><button className="row-action" onClick={()=>edit(s)}>{role==='admin'?'Edit':'View'}</button><button disabled={role!=='admin'||busy} title="Rotate credential" className="icon-btn" onClick={()=>rotate(s.id)}><KeyRound size={16}/></button></div></td></tr>)}</tbody></table></div>:<Empty title="No screens registered"/>}
  </Card>
  {open&&<div className="modal-backdrop" onClick={close}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="screen-dialog-title" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2 id="screen-dialog-title">{editing?'Screen configuration':'Register new screen'}</h2><button className="icon-btn" aria-label="Close screen configuration" onClick={close}>×</button></div>
   <form onSubmit={handleSubmit(submit)} className="normal-form"><fieldset disabled={role!=='admin'||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <FormField label="Screen name"><input required {...register('name',{required:true})}/></FormField>
    <div className="form-grid"><FormField label="TV profile"><select {...register('profileId')}>{(profiles||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField><FormField label="Assigned opening page"><select {...register('assignedPage')}>{Object.entries(catalog.pages).map(([k,name])=><option value={k} key={k}>{name}</option>)}</select></FormField></div>
    <FormField label="Screen orientation" help="This controls the layout inside the app. Set the Android display rotation to match the physical installation."><select {...register('orientationOverride')}><option value="inherit">Use profile setting</option><option value="auto">Automatic · use available width and height</option><option value="landscape">Landscape · top navigation</option><option value="portrait">Portrait · side navigation</option></select></FormField>
    <div className="form-grid"><FormField label="Location"><input list="screen-locations" {...register('location')}/><datalist id="screen-locations">{masters.locations?.filter(m=>m.active).map(m=><option key={m.id} value={m.name}/>)}</datalist></FormField><FormField label="Group"><input list="screen-groups" {...register('groupName')}/><datalist id="screen-groups">{masters.groups?.filter(m=>m.active).map(m=><option key={m.id} value={m.name}/>)}</datalist></FormField></div>
    <label className="checkline"><input type="checkbox" {...register('enabled')}/> Enabled</label>
    <div className="form-actions"><Button variant="secondary" type="button" onClick={close}>Close</Button><Button type="submit" icon={Save} loading={busy}>{editing?'Save changes':'Register screen'}</Button></div>
   </fieldset></form>
   {editing&&role==='admin'&&<div className="screen-reset"><strong>Shared viewing state</strong><div>Clear resume points, learned interests and favourites for this device. The profile, content and registration remain available.</div><Button variant="secondary" icon={RotateCcw} disabled={busy} loading={resetting} onClick={resetPreferences}>Reset device history & favourites</Button></div>}
   {secret&&<div className="secret-panel"><strong><KeyRound size={15}/> One-time screen credential</strong><code>{secret}</code><Button variant="secondary" icon={Copy} onClick={()=>navigator.clipboard.writeText(secret)}>Copy screen key</Button><small>The backend stores only its SHA-256 hash. Once this dialog closes, generate a new one if the key is lost.</small></div>}
  </div></div>}{feedback.node}
 </>;
}
