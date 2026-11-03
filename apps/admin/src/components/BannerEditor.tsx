import React,{useState} from 'react';
import {ImagePlus} from 'lucide-react';
import {FormField} from './Common';
import './experience-settings.css';

export const bannerUiSchema=Object.fromEntries(['bannerMode','bannerTitle','bannerTitleAr','bannerDescription','bannerDescriptionAr','landscapeImage','portraitImage','focalX','focalY'].map(key=>[key,{'ui:widget':'hidden'}]));
export default function BannerEditor({draft,onChange,onUpload,disabled=false}:{draft:Record<string,unknown>;onChange:(next:Record<string,unknown>)=>void;onUpload:(file:File,field:string)=>Promise<void>;disabled?:boolean}){
 const [uploading,setUploading]=useState<string|null>(null);
 const mode=String(draft.bannerMode||'auto'),x=Number(draft.focalX??.5),y=Number(draft.focalY??.5);
 const title=mode!=='auto'&&draft.bannerTitle?String(draft.bannerTitle):String(draft.title||'Your content title');
 const wide=String(draft.landscapeImage||draft.image||''),portrait=String(draft.portraitImage||draft.landscapeImage||draft.image||'');
 const locked=disabled||uploading!==null;
 function patch(key:string,value:unknown){onChange({...draft,[key]:value})}
 async function upload(file:File,field:string){setUploading(field);try{await onUpload(file,field)}finally{setUploading(null)}}
 return <div className="banner-editor">
  <h3>TV banner presentation</h3><p className="experience-note">One content record powers both layouts. Keep titles separate from the artwork so they stay readable on every screen.</p>
  <FormField label="Banner mode"><select disabled={locked} value={mode} onChange={e=>patch('bannerMode',e.target.value)}><option value="auto">Automatic · use content metadata</option><option value="override">Automatic with overrides</option><option value="manual">Manual presentation</option></select></FormField>
  <div className="banner-preview-grid">
   <div><div className="banner-preview">{wide&&<img src={wide} alt="Landscape banner crop" style={{objectPosition:`${x*100}% ${y*100}%`}}/>}<span>{title}</span></div><small className="banner-preview-label">Landscape · 16:9 artwork</small></div>
   <div><div className="banner-preview portrait">{portrait&&<img src={portrait} alt="Portrait banner crop" style={{objectPosition:`${x*100}% ${y*100}%`}}/>}<span>{title}</span></div><small className="banner-preview-label">Portrait · 9:16 artwork</small></div>
  </div>
  {['landscapeImage','portraitImage'].map(field=><div className="banner-upload-row" key={field}><label><ImagePlus size={14}/> {field==='landscapeImage'?'Landscape artwork':'Portrait artwork'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,field);e.target.value=''}}/></label>{uploading===field&&<small className="block-muted" role="status">Uploading and verifying image…</small>}{!!draft[field]&&<button type="button" disabled={locked} onClick={()=>patch(field,'')}>Use automatic artwork instead</button>}</div>)}
  <div className="banner-focal-controls"><FormField label={`Horizontal focus · ${Math.round(x*100)}%`}><input disabled={locked} type="range" min="0" max="1" step=".01" value={x} onChange={e=>patch('focalX',Number(e.target.value))}/></FormField><FormField label={`Vertical focus · ${Math.round(y*100)}%`}><input disabled={locked} type="range" min="0" max="1" step=".01" value={y} onChange={e=>patch('focalY',Number(e.target.value))}/></FormField></div>
  {mode!=='auto'&&<><FormField label="Banner title" help="Leave blank to use the content title."><input disabled={locked} maxLength={180} value={String(draft.bannerTitle||'')} onChange={e=>patch('bannerTitle',e.target.value)} placeholder={String(draft.title||'Content title')}/></FormField><FormField label="Arabic banner title"><input disabled={locked} dir="rtl" maxLength={180} value={String(draft.bannerTitleAr||'')} onChange={e=>patch('bannerTitleAr',e.target.value)}/></FormField><FormField label="Short banner description"><textarea disabled={locked} rows={3} maxLength={500} value={String(draft.bannerDescription||'')} onChange={e=>patch('bannerDescription',e.target.value)} placeholder="Use content description when blank"/></FormField><FormField label="Arabic banner description"><textarea disabled={locked} dir="rtl" rows={3} maxLength={500} value={String(draft.bannerDescriptionAr||'')} onChange={e=>patch('bannerDescriptionAr',e.target.value)}/></FormField></>}
  <p className="experience-note">These crop previews guide the artwork upload. The TV adds its own focus state and programme details. Missing artwork uses the MADAR brand fallback; source imports preserve these overrides.</p>
 </div>;
}
