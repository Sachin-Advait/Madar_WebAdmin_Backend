import React,{useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {FileCheck2,UploadCloud} from 'lucide-react';
import {request} from '../api';
import {Button,Card,Empty,ErrorBox,FormField} from './Common';
import './experience-settings.css';

type ImportFormat='m3u'|'xmltv'|'json';
type Preview={sourceId:string;format:ImportFormat;digest:string;counts:Record<string,number>;items:{externalId:string;kind:string;payload:Record<string,unknown>;action:string;resourceId?:string}[];warnings:string[]};
type ImportResult={created:number;updated:number;unchanged:number;ids:{kind:string;id:string;externalId:string}[];warnings:string[]};
export default function SourceImportPanel({role}:{role:string}){
 const [sourceId,setSourceId]=useState('main-headend'),[format,setFormat]=useState<ImportFormat>('m3u'),[text,setText]=useState(''),[fileName,setFileName]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null),[result,setResult]=useState<ImportResult|null>(null),[busy,setBusy]=useState<'preview'|'apply'|'file'|null>(null),[error,setError]=useState<unknown>(null);
 const client=useQueryClient(),canEdit=role==='admin';
 function clear(){setPreview(null);setResult(null);setError(null)}
 async function file(file:File){
  clear();setBusy('file');try{
   if(file.size>750*1024)throw Error('Choose a text export no larger than 750 KiB.');
   const content=await file.text();setText(content);setFileName(file.name);
   if(/\.xml$/i.test(file.name))setFormat('xmltv');else if(/\.json$/i.test(file.name))setFormat('json');else if(/\.m3u8?$/i.test(file.name))setFormat('m3u');
  }catch(e){setError(e)}finally{setBusy(null)}
 }
 async function inspect(e:React.FormEvent){
  e.preventDefault();setBusy('preview');setPreview(null);setResult(null);setError(null);
  try{if(new TextEncoder().encode(text).length>750*1024)throw Error('Export text must be no larger than 750 KiB.');setPreview(await request<Preview>('/api/admin/source-import/preview',{method:'POST',body:JSON.stringify({sourceId,format,text})}))}catch(e){setError(e)}finally{setBusy(null)}
 }
 async function apply(){
  if(!preview)return;setBusy('apply');setError(null);
  try{setResult(await request<ImportResult>('/api/admin/source-import/apply',{method:'POST',body:JSON.stringify({sourceId,format,text,digest:preview.digest})}));setPreview(null);await Promise.all([client.invalidateQueries({queryKey:['resources']}),client.invalidateQueries({queryKey:['overview']})])}catch(e){setError(e)}finally{setBusy(null)}
 }
 return <Card className="source-import">
  <div className="card-head"><div><h3>Channel scanner & provider imports</h3><p>Bring channel and guide exports into the shared content catalogue.</p></div><UploadCloud size={22} color="#6b5837"/></div>
  <div className="experience-note">Import the scanner's M3U channel list first, then XMLTV programmes using the same source ID. JSON accepts normalized content from a provider adapter. The device brand can be connected once its export or API contract is known.</div>
  {!canEdit&&<p className="experience-note">An administrator is required to import provider sources.</p>}
  <form className="normal-form" onSubmit={inspect}><fieldset disabled={!canEdit||busy!==null} style={{border:0,padding:0,margin:0,minWidth:0}}>
   <div className="form-grid"><FormField label="Stable source ID" help="Reuse this ID for later exports from the same headend."><input required pattern="[a-z][a-z0-9-]*" minLength={2} maxLength={60} value={sourceId} onChange={e=>{setSourceId(e.target.value);clear()}} placeholder="main-headend"/></FormField><FormField label="Export format"><select value={format} onChange={e=>{setFormat(e.target.value as ImportFormat);clear()}}><option value="m3u">M3U · channel list</option><option value="xmltv">XMLTV · programme guide</option><option value="json">JSON · normalized provider content</option></select></FormField></div>
   <label className="source-file-label">Upload export · up to 750 KiB, maximum 500 entries<input type="file" accept=".m3u,.m3u8,.xml,.json,application/json,application/xml,text/xml,text/plain" onChange={e=>{const selected=e.target.files?.[0];if(selected)void file(selected);e.target.value=''}}/>{fileName&&<small className="block-muted">{fileName}</small>}</label>
   <FormField label="Export content" help="Source URLs stay on the server. A remote URL is not fetched by this importer."><textarea required value={text} onChange={e=>{setText(e.target.value);setFileName('');clear()}} placeholder={format==='m3u'?'#EXTM3U\n#EXTINF:-1 tvg-id="channel-1",Channel One\nhttps://your-provider.example/channel-1.m3u8':format==='xmltv'?'<?xml version="1.0"?>\n<tv>…</tv>':'Paste the normalized JSON export documented in the developer guide.'}/></FormField>
   <div className="form-actions"><Button type="submit" variant="secondary" icon={FileCheck2} loading={busy==='preview'} disabled={!text.trim()||!sourceId}>Preview import</Button></div>
  </fieldset></form>
  {error!=null&&<div role="alert"><ErrorBox error={error}/></div>}
  {preview&&<div className="source-import-preview"><h4>Review draft changes</h4><div className="source-import-counts">{Object.entries(preview.counts||{}).map(([kind,count])=><span key={kind}>{kind}: {typeof count==='object'?JSON.stringify(count):count}</span>)}</div>
   {preview.items.length?<div className="responsive-table"><table className="table"><thead><tr><th>ACTION</th><th>TYPE</th><th>CONTENT</th><th>EXTERNAL ID</th></tr></thead><tbody>{preview.items.slice(0,50).map((item,i)=><tr key={`${item.kind}:${item.externalId}:${i}`}><td>{item.action}</td><td>{item.kind}</td><td>{String(item.payload.title||'Untitled')}</td><td>{item.externalId}</td></tr>)}</tbody></table>{preview.items.length>50&&<p className="experience-note">Showing the first 50 of {preview.items.length} entries. All validated entries will be applied.</p>}</div>:<Empty title="No importable entries" description="Check the format and source mappings in the export."/>}
   {!!preview.warnings?.length&&<div className="source-import-warnings">{preview.warnings.map((warning,i)=><div key={i}>{typeof warning==='string'?warning:JSON.stringify(warning)}</div>)}</div>}
   <p className="experience-note">Applying creates or updates drafts. Review and publish them in Content Management. Existing published content stays available; imported updates preserve fields changed by an administrator and banner overrides. A programme guide alone does not create replay video.</p>
   <p className="experience-note">If the source includes artwork, obtain the approved image from the provider and upload it in Content Management. The importer records its availability without downloading external files.</p>
   <div className="form-actions"><Button icon={UploadCloud} onClick={apply} loading={busy==='apply'} disabled={!canEdit||!preview.items.length}>Apply to drafts</Button></div>
  </div>}
  {result&&<div className="source-import-result" role="status"><strong>Import applied to drafts</strong><div>{result.created} created · {result.updated} updated · {result.unchanged} unchanged</div><div>Open the relevant Content Management section to review and publish.</div>{result.warnings?.map((warning,i)=><small className="block-muted" key={i}>{warning}</small>)}</div>}
 </Card>;
}

