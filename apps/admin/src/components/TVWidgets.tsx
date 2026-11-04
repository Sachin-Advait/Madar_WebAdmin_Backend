import React from 'react';
import {ArrowUpRight,CalendarDays,Clock3,Play,Radio,Users,Wifi} from 'lucide-react';
import type {PreviewSection} from '../types';

export function WidgetCard({section,compact=false}:{section:PreviewSection;compact?:boolean}){
 const data=section.data;
 const title=String(section.props?.title||section.type.replaceAll('_',' '));
 const items=Array.isArray(data)?data:[];
 const isMeeting=['meeting_summary','meeting_room_grid','meeting_schedule'].includes(section.type);
 const isQueue=['queue_summary','queue_calling','queue_counters'].includes(section.type);
 const isOdoo=['helpdesk_summary','task_summary','task_list'].includes(section.type),help=section.type==='helpdesk_summary';
 return <div className={`tv-widget tv-widget-${section.type} ${compact?'tv-widget-compact':''}`}>
  <div className="tv-widget-head"><span>{title}</span><ArrowUpRight size={14}/></div>
  {section.type==='featured_banner'?<div className="tv-banner"><div className="tv-banner-glow"/><span className="tv-kicker">FEATURED • MADAR</span><strong>{items[0]?.title||'Featured experience'}</strong><p>{items[0]?.description||'Curated content appears here'}</p><div className="tv-play-pill"><Play size={13} fill="currentColor"/> Watch now</div></div>:
   isMeeting?<>{data?.availability==='unconnected'?<div className="tv-no-data">Live meeting feed not connected</div>:<><div className="tv-stats"><span><b>{data?.todayMeetings??'—'}</b><small>Meetings today</small></span><span><b>{data?.ongoing??'—'}</b><small>In progress</small></span><span><b>{data?.upcoming??'—'}</b><small>Upcoming</small></span></div>{section.type==='meeting_room_grid'&&<div className="tv-room-list">{(data?.rooms||[]).map((r:any)=><div key={r.name}><span>{r.name}</span><b className={r.status==='available'?'positive':''}>{r.status}</b></div>)}</div>}</>}</>:
   isQueue?<>{data?.availability==='unconnected'?<div className="tv-no-data">Live queue feed not connected</div>:<><div className="tv-stats"><span><b>{data?.servedToday??'—'}</b><small>Served today</small></span><span><b>{data?.waiting??'—'}</b><small>Waiting</small></span><span><b>{data?.activeCounters??'—'}</b><small>Active counters</small></span></div>{section.type==='queue_calling'&&<div className="tv-room-list">{(data?.calls||[]).map((r:any)=><div key={r.ticket}><span>{r.ticket}</span><b>{r.counter}</b></div>)}</div>}</>}</>:
   isOdoo?<>{!data||['unconnected','error'].includes(data?.availability)?<div className="tv-no-data">{data?.availability==='error'?'Odoo cannot be reached':data?'Odoo is not connected':'Not published for this profile'}</div>:<>{section.type!=='task_list'&&<div className="tv-stats">{(help?[[data.total,'Total tickets'],[data.resolved,'Resolved'],[data.unresolved,'Unresolved']]:[[data.total,'Total tasks'],[data.finished,'Finished'],[data.unfinished,'Unfinished']]).map(([v,k])=><span key={k}><b>{v??'—'}</b><small>{k}</small></span>)}</div>}{section.type==='task_list'&&<div className="tv-room-list">{(data.items||[]).slice(0,compact?3:5).map((t:any)=><div key={t.id}><span>{t.name}</span><b>{t.assignees?.join(', ')||t.stage}</b></div>)}</div>}</>}</>:
   section.type==='info_links'?<div className="tv-mini-grid">{items.slice(0,6).map((r:any)=><div key={r.pageKey}>{r.title}</div>)}</div>:
   <div className="tv-card-row">{items.length?items.slice(0,compact?3:5).map((r:any,i:number)=><div className="tv-media-card" key={r.id||i}>
     {r.image?<img src={r.image} alt=""/>:<div className={`tv-placeholder tv-placeholder-${i%4}`}><span>{section.type==='live_channel_row'?'LIVE':section.type==='radio_row'?'RADIO':section.type==='priority_alerts'?'NOTICE':'MADAR'}</span><Play size={20}/></div>}
     <strong>{r.title}</strong><small>{r.category||r.priority||''}</small>
   </div>):<div className="tv-no-data">No published content in this section</div>}</div>}
 </div>
}

export function TVFrame({children,label='MADAR',page='Home',demo=false}:{children:React.ReactNode;label?:string;page?:string;demo?:boolean}){
 return <div className="tv-frame"><div className="tv-topnav"><div className="tv-logo"><span className="tv-logo-mark">◈</span> {label}</div><div className="tv-menu">{['Home','Live TV','Videos','Replay','Radio','Info Hub'].map(n=><span key={n} className={page.toLowerCase()===n.toLowerCase()?'tv-menu-active':''}>{n}</span>)}</div><div className="tv-clock">09:41</div></div><div className="tv-frame-body">{demo&&<div className="preview-demo-label">ILLUSTRATIVE SAMPLE DATA</div>}{children}</div></div>
}
