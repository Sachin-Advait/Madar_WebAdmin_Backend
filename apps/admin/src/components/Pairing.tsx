import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ShieldCheck} from 'lucide-react';
import {API,request} from '../api';
import {Button,Card,useFeedback} from './Common';
export default function Pairing({role}:{role:string}){
 const {data}=useQuery({queryKey:['pairings'],queryFn:()=>request<any[]>('/api/admin/enrollments'),refetchInterval:5000,enabled:role==='admin'});const {data:profiles}=useQuery({queryKey:['profiles'],queryFn:API.profiles});const [selection,setSelection]=useState<Record<string,string>>({});const f=useFeedback(),client=useQueryClient();
 async function approve(e:any){try{await request('/api/admin/enrollments/'+e.id+'/approve',{method:'POST',body:JSON.stringify({name:e.metadata.name,profileId:selection[e.id]||'public',location:'',groupName:'',assignedPage:'home',enabled:true})});await client.invalidateQueries({queryKey:['screens']});await client.invalidateQueries({queryKey:['pairings']});f.success('Device paired and first release queued')}catch(e){f.error(e)}}
 if(!data?.length)return <div className="info-strip"><ShieldCheck size={18}/><span>New TVs can request pairing from <a href="/tv" target="_blank" rel="noreferrer"><u>the TV player</u></a>. Verify the code on the physical screen before approving.</span></div>;
 return <><Card className="pairing-card"><h3>Devices awaiting approval</h3>{data.map(e=><div className="pairing-row" key={e.id}><div><strong>{e.metadata.name}</strong><small>{e.metadata.model} · {e.metadata.platform}</small></div><code>{e.code}</code><select aria-label="Pairing profile" value={selection[e.id]||'public'} onChange={v=>setSelection({...selection,[e.id]:v.target.value})}>{profiles?.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><Button icon={ShieldCheck} onClick={()=>approve(e)}>Approve & pair</Button></div>)}</Card>{f.node}</>
}
