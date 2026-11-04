import React,{useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {BellRing,Send,XCircle} from 'lucide-react';
import {API,request} from '../api';
import type {Role} from '../types';
import {Button,Card,Empty,ErrorBox,FormField,Loading,PageHeading,Status,useFeedback} from '../components/Common';

export const notificationCategories=[
 {id:'EMERGENCY',label:'Emergency',color:'#c0392b',hint:'Evacuation, fire, safety'},
 {id:'WARNING',label:'Warning',color:'#d68910',hint:'Weather, disruption, outage'},
 {id:'INFO',label:'Info',color:'#2e86c1',hint:'General information'},
 {id:'ANNOUNCEMENT',label:'Announcement',color:'#8e6b3e',hint:'Company news, reminders'},
 {id:'CELEBRATION',label:'Celebration',color:'#7d3c98',hint:'Holidays, achievements'},
] as const;
type Category=typeof notificationCategories[number]['id'];
type Sent={id:string;title:string;message:string;category:Category;durationSeconds:number;playSound:boolean;screenIds:string[];status:'sent'|'expired'|'cancelled';alertId:string|null;createdBy:string;createdAt:string;expiresAt:string;cancelledBy:string|null;cancelledAt:string|null};
const empty={title:'',message:'',category:'INFO' as Category,durationSeconds:30,playSound:true,allScreens:true,screenIds:[] as string[],addToPriorityAlerts:false,alertEndAt:''};
const when=(v:string)=>new Date(v).toLocaleString();

export default function Notifications({role}:{role:Role}){
 const client=useQueryClient(),feedback=useFeedback();
 const {data:history,error,isLoading}=useQuery<Sent[]>({queryKey:['notifications'],queryFn:()=>request('/api/admin/notifications'),refetchInterval:5000});
 const {data:screens=[]}=useQuery({queryKey:['screens'],queryFn:API.screens});
 const [form,setForm]=useState(empty);const [busy,setBusy]=useState(false);
 const set=<K extends keyof typeof empty>(k:K,v:(typeof empty)[K])=>setForm(f=>({...f,[k]:v}));
 const canSend=role==='admin';
 const screenName=useMemo(()=>Object.fromEntries(screens.map(s=>[s.id,s.name])),[screens]);
 const category=notificationCategories.find(c=>c.id===form.category)!;
 async function send(e:React.FormEvent){
  e.preventDefault();
  if(!form.allScreens&&!form.screenIds.length){feedback.error('Choose at least one screen, or send to all screens.');return}
  setBusy(true);
  try{
   await request('/api/admin/notifications',{method:'POST',body:JSON.stringify({title:form.title,message:form.message,category:form.category,durationSeconds:Number(form.durationSeconds),playSound:form.playSound,screenIds:form.allScreens?[]:form.screenIds,addToPriorityAlerts:form.addToPriorityAlerts,...(form.addToPriorityAlerts&&form.alertEndAt?{alertEndAt:new Date(form.alertEndAt).toISOString()}:{})})});
   feedback.success(form.allScreens?'Notification sent to all screens':`Notification sent to ${form.screenIds.length} screen(s)`);
   setForm({...empty,category:form.category});
   await client.invalidateQueries({queryKey:['notifications']});
  }catch(err){feedback.error(err)}finally{setBusy(false)}
 }
 async function cancel(n:Sent){
  if(!window.confirm(`Take "${n.title}" off the screens now?`))return;
  try{await request(`/api/admin/notifications/${n.id}/cancel`,{method:'POST'});feedback.success('Notification cancelled');await client.invalidateQueries({queryKey:['notifications']})}catch(err){feedback.error(err)}
 }
 return <>
  <PageHeading eyebrow="ALERTS / LIVE" title="Send TV Notification" subtitle="Show a full-screen message on all TVs or chosen screens right now. It closes by itself after the duration, or when you cancel it."/>
  <div className="info-strip"><BellRing size={18}/><span>For a notice that stays in the TV's Priority Alerts page, tick "Also add to Priority Alerts", or manage them under Content Management → Priority Alerts.</span></div>
  <div className="settings-layout">
   <Card>
    <div className="card-head"><div><h3><Send size={16}/> New notification</h3><p>Screens pick it up within a few seconds.</p></div></div>
    <form className="normal-form" onSubmit={send}>
     <FormField label="Category">
      <div className="notification-categories">{notificationCategories.map(c=><button type="button" key={c.id} className={'notification-category'+(form.category===c.id?' selected':'')} style={{'--cat':c.color} as React.CSSProperties} onClick={()=>set('category',c.id)} title={c.hint}>{c.label}</button>)}</div>
     </FormField>
     <FormField label="Title"><input required minLength={2} maxLength={120} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Fire drill at 11:00"/></FormField>
     <FormField label="Message (optional)"><textarea rows={3} maxLength={500} value={form.message} onChange={e=>set('message',e.target.value)} placeholder="Please leave by the nearest exit and gather at the car park."/></FormField>
     <FormField label={`Show for ${form.durationSeconds} seconds`} help="Between 5 and 120 seconds."><input type="range" min={5} max={120} step={5} value={form.durationSeconds} onChange={e=>set('durationSeconds',Number(e.target.value))}/></FormField>
     <label className="checkline"><input type="checkbox" checked={form.playSound} onChange={e=>set('playSound',e.target.checked)}/> Play a sound on the TV</label>
     <label className="checkline"><input type="checkbox" checked={form.allScreens} onChange={e=>set('allScreens',e.target.checked)}/> Send to all screens</label>
     {!form.allScreens&&<div className="access-pages"><strong>Choose screens ({form.screenIds.length} selected)</strong>{screens.length?<div className="page-allow-list">{screens.map(s=><label className="checkline" key={s.id}><input type="checkbox" checked={form.screenIds.includes(s.id)} onChange={e=>set('screenIds',e.target.checked?[...form.screenIds,s.id]:form.screenIds.filter(x=>x!==s.id))}/>{s.name}{s.location?` · ${s.location}`:''}</label>)}</div>:<span className="table-muted">No screens are paired yet.</span>}</div>}
     <label className="checkline"><input type="checkbox" checked={form.addToPriorityAlerts} onChange={e=>set('addToPriorityAlerts',e.target.checked)}/> Also add to Priority Alerts</label>
     {form.addToPriorityAlerts&&<FormField label="Keep in Priority Alerts until" help="Leave empty for 24 hours."><input type="datetime-local" value={form.alertEndAt} onChange={e=>set('alertEndAt',e.target.value)}/></FormField>}
     <div className="notification-preview" style={{'--cat':category.color} as React.CSSProperties}><small>{category.label.toUpperCase()}</small><strong>{form.title||'Your title appears here'}</strong>{form.message&&<span>{form.message}</span>}</div>
     <div className="form-actions"><Button icon={Send} type="submit" loading={busy} disabled={!canSend}>Send now</Button></div>
     {!canSend&&<span className="table-muted">Only administrators can send notifications.</span>}
    </form>
   </Card>
   <Card>
    <div className="card-head"><div><h3>Notification history</h3><p>Latest 200 notifications. Active ones can be cancelled.</p></div></div>
    {isLoading?<Loading/>:error?<ErrorBox error={error}/>:history?.length?<div className="responsive-table"><table className="table"><thead><tr><th>NOTIFICATION</th><th>SCREENS</th><th>SENT</th><th>STATUS</th><th></th></tr></thead><tbody>{history.map(n=><tr key={n.id}>
     <td><div className="content-name"><span className="profile-dot" style={{background:notificationCategories.find(c=>c.id===n.category)?.color}}/><div><strong>{n.title}</strong><small>{n.category} · {n.durationSeconds}s{n.playSound?' · sound':''}{n.alertId?' · in Priority Alerts':''}</small></div></div></td>
     <td>{n.screenIds.length?n.screenIds.map(id=>screenName[id]||'Removed screen').join(', '):'All screens'}</td>
     <td>{when(n.createdAt)}<br/><small className="table-muted">{n.createdBy}</small></td>
     <td><Status value={n.status==='sent'?'Active':n.status==='cancelled'?'Cancelled':'Expired'}/>{n.cancelledBy&&<><br/><small className="table-muted">by {n.cancelledBy}</small></>}</td>
     <td><div className="action-cell">{n.status==='sent'&&<Button variant="danger" icon={XCircle} onClick={()=>cancel(n)} disabled={!canSend}>Cancel</Button>}</div></td>
    </tr>)}</tbody></table></div>:<Empty title="No notifications yet" description="Notifications you send appear here."/>}
   </Card>
  </div>
  {feedback.node}
 </>;
}
