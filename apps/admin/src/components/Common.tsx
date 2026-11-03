import React, {useEffect,useState} from 'react';
import {AlertCircle,CheckCircle2,Info,LoaderCircle,Plus,Save,Trash2} from 'lucide-react';

export function PageHeading({eyebrow,title,subtitle,children}:{eyebrow?:string;title:string;subtitle?:string;children?:React.ReactNode}){
 return <header className="page-heading"><div><div className="eyebrow">{eyebrow||'MADAR • ADMINISTRATION'}</div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div className="heading-actions">{children}</div></header>
}
export function Button({children,variant='primary',icon:Icon,loading=false,...props}:{children:React.ReactNode;variant?:'primary'|'secondary'|'ghost'|'danger';icon?:React.ComponentType<any>;loading?:boolean}&React.ButtonHTMLAttributes<HTMLButtonElement>){
 return <button {...props} className={`btn btn-${variant} ${props.className||''}`} disabled={props.disabled||loading}>{loading?<LoaderCircle size={16} className="spin"/>:Icon?<Icon size={16}/>:null}{children}</button>
}
export function Empty({title='Nothing here',description='Add a new item to begin.'}:{title?:string;description?:string}){
 return <div className="empty"><div className="empty-icon"><Info size={23}/></div><strong>{title}</strong><span>{description}</span></div>
}
export function Loading(){return <div className="loading"><LoaderCircle className="spin"/> Loading data…</div>}
export function ErrorBox({error}:{error:unknown}){return <div className="error-box"><AlertCircle size={18}/>{error instanceof Error?error.message:String(error)}</div>}
export function Status({value}:{value:string}){return <span className={`status status-${value.replaceAll(' ','-').toLowerCase()}`}>{value}</span>}
export function Pill({children}:{children:React.ReactNode}){return <span className="pill">{children}</span>}
export function Card({children,className=''}:{children:React.ReactNode;className?:string}){return <section className={`card ${className}`}>{children}</section>}
export function FormField({label,children,help}:{label:string;children:React.ReactNode;help?:string}){return <label className="form-field"><span className="field-label">{label}</span>{children}{help&&<small>{help}</small>}</label>}
export function Notice({text,onClose,kind='success'}:{text:string;onClose?:()=>void;kind?:'success'|'error'}){
 useEffect(()=>{if(!onClose)return;const t=setTimeout(onClose,4500);return()=>clearTimeout(t)},[text,onClose]);
 return <div className={`toast toast-${kind}`}>{kind==='success'?<CheckCircle2 size={17}/>:<AlertCircle size={17}/>}<span>{text}</span>{onClose&&<button onClick={onClose}>×</button>}</div>
}
export function useFeedback(){
 const [message,setMessage]=useState<{text:string;kind:'success'|'error'}|null>(null);
 const success=(text:string)=>setMessage({text,kind:'success'});
 const error=(e:unknown)=>setMessage({text:e instanceof Error?e.message:String(e),kind:'error'});
 const node=message?<Notice text={message.text} kind={message.kind} onClose={()=>setMessage(null)}/>:null;
 return {success,error,node};
}
