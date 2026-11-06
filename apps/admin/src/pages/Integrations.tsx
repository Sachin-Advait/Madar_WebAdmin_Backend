import React,{useEffect,useState} from 'react';
import SourceImportPanel from '../components/SourceImportPanel';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,Cable,CalendarClock,FileImage,Headset,KeyRound,ListChecks,MonitorPlay,PlugZap,Rss,Save,Ticket,Upload} from 'lucide-react';
import {API,request} from '../api';
import {adminHash} from '../navigation';
import {PageHeading,Card,Status,useFeedback,Button,FormField,copyText} from '../components/Common';

type OdooSettings={enabled:boolean;url:string;database:string;username:string;timezone:string;effectiveTimezone:string;taskScope:'deadline'|'created';weekStart:'sunday'|'monday'|'saturday';helpdesk:boolean;tasks:boolean;profiles:string[];apiKeyConfigured:boolean;apiKeyFromEnvironment:boolean;configured:boolean;status?:Record<string,{lastSuccessAt?:string;lastError?:string}>};
type OdooForm=Omit<OdooSettings,'effectiveTimezone'|'apiKeyConfigured'|'apiKeyFromEnvironment'|'configured'|'status'>&{apiKey:string;clearApiKey:boolean};
type TestResult={uid:number;helpdesk?:any;tasks?:any};
const profiles=[['public','Public / Visitor'],['employee','Employee'],['management','Management'],['vip','VIP Lounge'],['signage','Dedicated Signage']];
const go=(id:string)=>{window.location.hash=adminHash(id)};

export default function Integrations({assets=false,role}:{assets?:boolean;role:string}){
 const {data,refetch}=useQuery({queryKey:[assets?'assets':'integrations'],queryFn:()=>request<any>(assets?'/api/admin/assets':'/api/admin/integrations')});const f=useFeedback();const [busy,setBusy]=useState(false);
 async function upload(file:File){setBusy(true);try{await API.uploadAsset(file);await refetch();f.success('Asset uploaded and verified')}catch(e){f.error(e)}finally{setBusy(false)}}
 if(assets)return <><PageHeading eyebrow="CONTENT WORKSPACE" title="Media assets" subtitle="Upload artwork, documents and media once. Reference them across your experiences."><label className="upload-button"><Upload size={16}/>{busy?'Uploading…':'Upload asset'}<input hidden type="file" disabled={busy||role==='viewer'} accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,audio/mpeg" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0])}}/></label></PageHeading><div className="asset-grid">{(data||[]).map((a:any)=><Card key={a.id}>{a.mime.startsWith('image/')?<img className="asset-thumb" src={'/api/assets/'+a.id} alt={a.name}/>:a.mime.startsWith('video/')?<video className="asset-thumb" src={'/api/assets/'+a.id} controls preload="metadata"/>:a.mime.startsWith('audio/')?<audio src={'/api/assets/'+a.id} controls preload="none" style={{width:'100%'}}/>:<div className="asset-thumb empty-art"><FileImage/></div>}<strong>{a.name}</strong><small className="block-muted">{a.mime} · {(Number(a.bytes)/1024/1024).toFixed(2)} MB</small><Button variant="secondary" onClick={()=>copyText('/api/assets/'+a.id).then(()=>f.success('Asset reference copied: /api/assets/'+a.id),f.error)}>Copy reference</Button></Card>)}</div>{!data?.length&&<Card><p>Upload your first asset to build the shared media library.</p></Card>}<div className="info-strip">Artwork: PNG, JPEG or WebP, up to 10 MB. Documents and media: PDF, MP4 or MP3, up to 100 MB.</div>{f.node}</>;
 const feed=(id:string)=>data?.feeds?.some((r:any)=>r.id===id)?'Connected':data?.demo?'Sample data':'Unconnected';
 const odoo=data?.odoo as OdooSettings|undefined;
 const odooState=(kind:'helpdesk'|'tasks')=>!odoo?'Unconnected':!odoo.configured?(data?.demo?'Sample data':'Unconnected'):!odoo.enabled||!odoo[kind]?'Disabled':odoo.status?.[kind]?.lastError?'Error':'Connected';
 const news=data?.news;
 const cards=[
  {id:'meeting',title:'Meeting rooms',icon:CalendarClock,desc:'Room availability, meeting counts and upcoming schedules.',state:feed('meeting'),note:'Authenticated snapshot ingestion · 90-second stale threshold',link:['content:meetings','Meeting schedule']},
  {id:'queue',title:'Queue management (QMS)',icon:Ticket,desc:'Waiting, served, counter status and tickets being called.',state:feed('queue'),note:'Authenticated snapshot ingestion · 90-second stale threshold',link:['content:queueTickets','Queue tickets']},
  {id:'news',title:'News feed (ticker)',icon:Rss,desc:'RSS or Atom headlines that scroll in the Breaking News ticker.',state:news?.headlines?(news.tickerEnabled?'Connected':'Disabled'):news?.feeds?'Configured':'Unconnected',note:`${news?.feeds??0} saved feed(s) · ${news?.headlines??0} headline(s) on the ticker${news&&!news.tickerEnabled?' · ticker turned off':''}`,link:['breaking-news','Breaking News']},
  {id:'helpdesk',title:'Help Desk',icon:Headset,desc:"Today's tickets from Odoo: total, resolved and unresolved.",state:odooState('helpdesk'),note:odoo?.status?.helpdesk?.lastError||'Odoo Help Desk · refreshed every minute',link:null},
  {id:'tasks',title:'Daily tasks',icon:ListChecks,desc:"Today's Odoo project tasks: total, finished, unfinished and a list of what is still open.",state:odooState('tasks'),note:odoo?.status?.tasks?.lastError||'Odoo Project · refreshed every minute',link:null},
  {id:'media',title:'Media playback',icon:MonitorPlay,desc:'Authorized channel, video, replay and radio sources.',state:data?.mediaConfigured?'Configured':'Unconnected',note:'Server-managed playback references',link:null},
 ];
 return <><PageHeading eyebrow="PLATFORM CONNECTIONS" title="Integrations" subtitle="Connect operational systems and authorized media providers to MADAR."/>
  <div className="integration-grid">{cards.map(x=><Card key={x.id}><div className="integration-icon"><x.icon size={26}/></div><h2>{x.title}</h2><p>{x.desc}</p><Status value={x.state}/><small className="block-muted integration-note">{x.note}</small>{x.link&&<button className="row-action integration-link" onClick={()=>go(x.link![0])}>{x.link[1]} <ArrowUpRight size={13}/></button>}</Card>)}</div>
  <OdooPanel settings={odoo} role={role} onSaved={()=>refetch()}/>
  <Card><h3><Cable size={18}/> Connection contract</h3><p className="integration-copy">Meeting and queue systems send normalized snapshots to the backend. Service credentials are kept on the server. The developer guide contains the fields, authentication method, sample payloads and simulator command.</p><div className="info-strip">{data?.ingestConfigured?'Integration key configured.':'No integration key configured. Set INTEGRATION_KEY on the server before sending live data.'}</div></Card>
  <SourceImportPanel role={role}/>{f.node}</>
}

function OdooPanel({settings,role,onSaved}:{settings?:OdooSettings;role:string;onSaved:()=>void}){
 const f=useFeedback(),client=useQueryClient(),canEdit=role==='admin';
 const [form,setForm]=useState<OdooForm|null>(null),[busy,setBusy]=useState(''),[result,setResult]=useState<TestResult|null>(null);
 useEffect(()=>{if(settings&&!form){const v=settings;setForm({enabled:v.enabled,url:v.url,database:v.database,username:v.username,timezone:v.timezone,taskScope:v.taskScope,weekStart:v.weekStart||'sunday',helpdesk:v.helpdesk,tasks:v.tasks,profiles:v.profiles,apiKey:'',clearApiKey:false})}},[settings]);
 if(!form||!settings)return null;
 const set=(patch:Partial<OdooForm>)=>setForm({...form,...patch});
 async function save(test=false){setBusy(test?'test':'save');try{
   await request('/api/admin/odoo',{method:'PUT',body:JSON.stringify(form)});setForm(v=>v&&{...v,apiKey:'',clearApiKey:false});
   await client.invalidateQueries({queryKey:['integrations']});onSaved();
   if(test){const r=await request<TestResult>('/api/admin/odoo/test',{method:'POST',body:'{}'});setResult(r);const errors=[r.helpdesk?.error,r.tasks?.error].filter(Boolean);if(errors.length)f.error(errors.join(' · '));else f.success('Connected to Odoo');await client.invalidateQueries({queryKey:['integrations']})}
   else f.success('Odoo settings saved. TVs receive the change on their next sync.');
  }catch(e){f.error(e)}finally{setBusy('')}}
 return <Card className="odoo-panel">
  <div className="card-head"><div><h3><PlugZap size={18}/> Odoo connection · Help Desk & Daily tasks</h3><p>MADAR reads Odoo through its external API with a user login and API key. In Odoo, open your user's Preferences, then Account Security, then New API Key.</p></div><Status value={!settings.configured?'Unconnected':settings.enabled?'Configured':'Disabled'}/></div>
  <form className="normal-form" onSubmit={e=>{e.preventDefault();save(true)}}>
   <fieldset disabled={!canEdit} className="odoo-fieldset">
    <label className="checkline"><input type="checkbox" checked={form.enabled} onChange={e=>set({enabled:e.target.checked})}/> Show Odoo data on TVs</label>
    <div className="form-grid">
     <FormField label="Odoo address"><input type="url" placeholder="https://odoo.example.com" value={form.url} onChange={e=>set({url:e.target.value})}/></FormField>
     <FormField label="Database"><input placeholder="omnicallcrm" value={form.database} onChange={e=>set({database:e.target.value})}/></FormField>
     <FormField label="User (login email)"><input autoComplete="off" placeholder="manager@example.com" value={form.username} onChange={e=>set({username:e.target.value})}/></FormField>
     <FormField label="API key" help={settings.apiKeyFromEnvironment?'Using ODOO_API_KEY from the server environment.':settings.apiKeyConfigured?'A key is saved. Leave blank to keep it.':'Paste the key generated in Odoo.'}><div className="odoo-key"><KeyRound size={15}/><input type="password" autoComplete="new-password" placeholder={settings.apiKeyConfigured?'•••••••• saved':'Paste API key'} value={form.apiKey} onChange={e=>set({apiKey:e.target.value,clearApiKey:false})}/></div></FormField>
     <FormField label="Time zone for “today”" help={`Leave blank to use the server time zone (${settings.effectiveTimezone}).`}><input placeholder="Asia/Muscat" value={form.timezone} onChange={e=>set({timezone:e.target.value})}/></FormField>
     <FormField label="Daily tasks are" help="Which Odoo tasks count as today's tasks."><select value={form.taskScope} onChange={e=>set({taskScope:e.target.value as OdooForm['taskScope']})}><option value="deadline">Tasks with a deadline today</option><option value="created">Tasks created today</option></select></FormField>
     <FormField label="Week starts on" help="Work & Support's This week view counts from this day, in the time zone above."><select value={form.weekStart} onChange={e=>set({weekStart:e.target.value as OdooForm['weekStart']})}><option value="sunday">Sunday (Sunday to Thursday week)</option><option value="monday">Monday</option><option value="saturday">Saturday</option></select></FormField>
    </div>
    <div className="odoo-toggles"><label className="checkline"><input type="checkbox" checked={form.helpdesk} onChange={e=>set({helpdesk:e.target.checked})}/><Headset size={15}/> Help Desk</label><label className="checkline"><input type="checkbox" checked={form.tasks} onChange={e=>set({tasks:e.target.checked})}/><ListChecks size={15}/> Daily tasks</label></div>
    <div className="access-pages"><strong>Show on these profiles (none ticked = all)</strong><div className="page-allow-list">{profiles.map(([id,label])=><label className="checkline" key={id}><input type="checkbox" checked={form.profiles.includes(id)} onChange={e=>set({profiles:e.target.checked?[...form.profiles,id]:form.profiles.filter(p=>p!==id)})}/>{label}</label>)}</div></div>
    {settings.apiKeyConfigured&&!settings.apiKeyFromEnvironment&&<label className="checkline"><input type="checkbox" checked={form.clearApiKey} onChange={e=>set({clearApiKey:e.target.checked,apiKey:''})}/> Remove the saved API key</label>}
    <div className="form-actions"><Button variant="secondary" icon={Save} loading={busy==='save'} onClick={()=>save(false)}>Save</Button><Button type="submit" icon={PlugZap} loading={busy==='test'}>Save & test connection</Button></div>
   </fieldset>
  </form>
  {result&&<div className="odoo-result">
   <div><Headset size={16}/><strong>Help Desk</strong>{result.helpdesk?.error?<span className="odoo-error">{result.helpdesk.error}</span>:result.helpdesk?.skipped?<span>Turned off</span>:<span>{result.helpdesk?.total} today · {result.helpdesk?.resolved} resolved · {result.helpdesk?.unresolved} unresolved</span>}</div>
   <div><ListChecks size={16}/><strong>Daily tasks</strong>{result.tasks?.error?<span className="odoo-error">{result.tasks.error}</span>:result.tasks?.skipped?<span>Turned off</span>:<span>{result.tasks?.total} today · {result.tasks?.finished} finished · {result.tasks?.unfinished} unfinished</span>}</div>
  </div>}
  <div className="info-strip">Help Desk and Daily tasks appear in the TV Info Hub under the Management tab, and can be placed on any page with the Page Builder. Data refreshes every minute.</div>
  {f.node}
 </Card>;
}
