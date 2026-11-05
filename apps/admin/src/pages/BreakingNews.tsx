import React,{useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Download,Newspaper,Plus,Rss,Save,Send,Trash2} from 'lucide-react';
import {request} from '../api';
import type {Role} from '../types';
import {Button,Card,Empty,ErrorBox,FormField,Loading,PageHeading,useFeedback} from '../components/Common';

type Feed={id:string;url:string;name:string;createdAt:string;lastFetchedAt:string|null};
type Fetched={url:string;source:string;items:{title:string;link:string;publishedAt:string|null}[]};
type Headline={id:string;title:string;source:string;link:string;createdBy:string;createdAt:string;expiresAt:string|null};
type Ticker={enabled:boolean;label:string;labelAr:string;speed:'slow'|'normal'|'fast';profiles:string[]};
const profiles=[['public','Public / Visitor'],['employee','Employee'],['management','Management'],['vip','VIP Lounge'],['signage','Dedicated Signage']];
const post=(url:string,body:unknown,method='POST')=>request(url,{method,body:JSON.stringify(body)});

export default function BreakingNews({role}:{role:Role}){
 const client=useQueryClient(),feedback=useFeedback(),canEdit=role!=='viewer';
 const {data:feeds=[]}=useQuery<Feed[]>({queryKey:['news-feeds'],queryFn:()=>request('/api/admin/news/feeds')});
 const {data:published,error,isLoading}=useQuery<Headline[]>({queryKey:['news'],queryFn:()=>request('/api/admin/news')});
 const {data:settings}=useQuery<Ticker>({queryKey:['news-settings'],queryFn:()=>request('/api/admin/news/settings')});
 const [url,setUrl]=useState('');const [fetched,setFetched]=useState<Fetched|null>(null);const [picked,setPicked]=useState<Set<number>>(new Set());
 const [manual,setManual]=useState('');const [replace,setReplace]=useState(false);const [expiresAt,setExpiresAt]=useState('');
 const [ticker,setTicker]=useState<Ticker|null>(null);const [busy,setBusy]=useState('');
 useEffect(()=>{if(settings)setTicker(settings)},[settings]);
 const refresh=()=>Promise.all([client.invalidateQueries({queryKey:['news']}),client.invalidateQueries({queryKey:['news-feeds']})]);
 async function run(name:string,fn:()=>Promise<void>){setBusy(name);try{await fn()}catch(e){feedback.error(e)}finally{setBusy('')}}
 const fetchFeed=(address=url)=>run('fetch',async()=>{const r=await post('/api/admin/news/fetch',{url:address}) as Fetched;setUrl(r.url);setFetched(r);setPicked(new Set(r.items.map((_,i)=>i)));if(!r.items.length)feedback.error('The feed has no headlines right now');await refresh()});
 const publish=(items:{title:string;source?:string;link?:string}[])=>run('publish',async()=>{const r=await post('/api/admin/news/publish',{items,replace,...(expiresAt?{expiresAt:new Date(expiresAt).toISOString()}:{})}) as {added:number;skipped:number};feedback.success(`${r.added} headline(s) published${r.skipped?`, ${r.skipped} already on the ticker`:''}`);setFetched(null);setManual('');await refresh()});
 const remove=(id:string)=>run('remove',async()=>{await request('/api/admin/news/'+id,{method:'DELETE'});await refresh()});
 const clearAll=()=>{if(window.confirm('Remove every headline from the ticker?'))run('clear',async()=>{await request('/api/admin/news',{method:'DELETE'});feedback.success('Ticker cleared');await refresh()})};
 const removeFeed=(id:string)=>run('feed',async()=>{await request('/api/admin/news/feeds/'+id,{method:'DELETE'});await refresh()});
 const saveTicker=()=>ticker&&run('ticker',async()=>{await post('/api/admin/news/settings',ticker,'PUT');feedback.success('Ticker settings saved');await client.invalidateQueries({queryKey:['news-settings']})});
 return <>
  <PageHeading eyebrow="ALERTS / NEWS" title="Breaking News" subtitle="Pull headlines from RSS feeds or type your own. Published headlines scroll across the bottom of every TV."/>
  <div className="settings-layout">
   <Card>
    <div className="card-head"><div><h3><Rss size={16}/> Fetch from a feed</h3><p>RSS or Atom address. Feeds you use are saved below.</p></div></div>
    <form className="normal-form" onSubmit={e=>{e.preventDefault();fetchFeed()}}>
     <FormField label="Feed address"><input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.example.com/rss.xml"/></FormField>
     <div className="form-actions"><Button icon={Download} type="submit" loading={busy==='fetch'} disabled={!canEdit}>Fetch headlines</Button></div>
    </form>
    {feeds.length>0&&<div className="connection-list" style={{marginTop:14}}><strong>Saved feeds ({feeds.length})</strong>{feeds.map(f=><div className="connection-row" key={f.id}><span title={f.url} style={{display:'flex',gap:8,alignItems:'flex-start',minWidth:0}}><Rss size={14} style={{flex:'none',marginTop:3}}/><span style={{minWidth:0}}><span style={{display:'block'}}>{f.name||f.url}</span><small style={{display:'block',opacity:.7,overflowWrap:'anywhere'}}>{f.url}{f.lastFetchedAt?` · last fetched ${new Date(f.lastFetchedAt).toLocaleString()}`:''}</small></span></span><div className="action-cell"><button className="row-action" onClick={()=>fetchFeed(f.url)} disabled={!canEdit||!!busy}>Fetch</button><button className="icon-btn hover-danger" title="Forget feed" onClick={()=>removeFeed(f.id)} disabled={!canEdit}><Trash2 size={14}/></button></div></div>)}</div>}
    {fetched&&<div className="access-pages" style={{marginTop:16}}>
     <strong>{fetched.source||'Feed'}: {picked.size} of {fetched.items.length} selected</strong>
     <label className="checkline"><input type="checkbox" checked={picked.size===fetched.items.length} onChange={e=>setPicked(e.target.checked?new Set(fetched.items.map((_,i)=>i)):new Set())}/> Select all</label>
     <div className="news-pick-list">{fetched.items.map((item,i)=><label className="checkline" key={i}><input type="checkbox" checked={picked.has(i)} onChange={e=>{const next=new Set(picked);if(e.target.checked)next.add(i);else next.delete(i);setPicked(next)}}/>{item.title}</label>)}</div>
     <div className="form-actions"><Button icon={Send} loading={busy==='publish'} disabled={!canEdit||!picked.size} onClick={()=>publish(fetched.items.filter((_,i)=>picked.has(i)).map(i=>({title:i.title,source:fetched.source,link:i.link})))}>Publish selected</Button></div>
    </div>}
    <div className="card-head" style={{marginTop:22}}><div><h3><Plus size={16}/> Type headlines</h3><p>One headline per line.</p></div></div>
    <div className="normal-form">
     <FormField label="Headlines"><textarea rows={3} value={manual} onChange={e=>setManual(e.target.value)} placeholder={'Main gate closed for maintenance until 14:00\nQuarterly town hall tomorrow at 10:00'}/></FormField>
     <label className="checkline"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/> Replace all current headlines when publishing</label>
     <FormField label="Remove headlines automatically at (optional)"><input type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></FormField>
     <div className="form-actions"><Button icon={Send} loading={busy==='publish'} disabled={!canEdit||!manual.trim()} onClick={()=>publish(manual.split('\n').map(t=>t.trim()).filter(Boolean).map(title=>({title})))}>Publish</Button></div>
    </div>
   </Card>
   <div style={{display:'grid',gap:17,alignContent:'start'}}>
    <Card>
     <div className="card-head"><div><h3><Newspaper size={16}/> On the ticker now</h3><p>{published?.length||0} headline(s)</p></div>{!!published?.length&&<Button variant="secondary" icon={Trash2} onClick={clearAll} disabled={!canEdit}>Clear all</Button>}</div>
     {isLoading?<Loading/>:error?<ErrorBox error={error}/>:published?.length?<div className="responsive-table"><table className="table"><tbody>{published.map(h=><tr key={h.id}><td><strong>{h.title}</strong><br/><small className="table-muted">{h.source||'Typed'} · {new Date(h.createdAt).toLocaleString()}{h.expiresAt?` · until ${new Date(h.expiresAt).toLocaleString()}`:''}</small></td><td><div className="action-cell"><button className="icon-btn hover-danger" title="Remove" onClick={()=>remove(h.id)} disabled={!canEdit}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>:<Empty title="No headlines" description="Fetch a feed or type headlines to start the ticker."/>}
    </Card>
    {ticker&&<Card>
     <div className="card-head"><div><h3>Ticker settings</h3><p>How and where the ticker appears on TVs.</p></div></div>
     <div className="normal-form">
      <label className="checkline"><input type="checkbox" checked={ticker.enabled} onChange={e=>setTicker({...ticker,enabled:e.target.checked})}/> Show the ticker on TVs</label>
      <div className="form-grid"><FormField label="Label"><input maxLength={40} value={ticker.label} onChange={e=>setTicker({...ticker,label:e.target.value})}/></FormField><FormField label="Arabic label"><input dir="rtl" maxLength={40} value={ticker.labelAr} onChange={e=>setTicker({...ticker,labelAr:e.target.value})}/></FormField></div>
      <FormField label="Scroll speed"><select value={ticker.speed} onChange={e=>setTicker({...ticker,speed:e.target.value as Ticker['speed']})}><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></FormField>
      <div className="access-pages"><strong>Show on these profiles (none ticked = all)</strong><div className="page-allow-list">{profiles.map(([id,label])=><label className="checkline" key={id}><input type="checkbox" checked={ticker.profiles.includes(id)} onChange={e=>setTicker({...ticker,profiles:e.target.checked?[...ticker.profiles,id]:ticker.profiles.filter(p=>p!==id)})}/>{label}</label>)}</div></div>
      <div className="form-actions"><Button icon={Save} onClick={saveTicker} loading={busy==='ticker'} disabled={role!=='admin'}>Save ticker settings</Button></div>
     </div>
    </Card>}
   </div>
  </div>
  {feedback.node}
 </>;
}
