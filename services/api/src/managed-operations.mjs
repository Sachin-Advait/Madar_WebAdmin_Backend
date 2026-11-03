import {rows} from './db.mjs';
import {activeAt} from './domain.mjs';
export async function managedOperations(db,kind,profile){
 const masterKind=kind==='meeting'?'rooms':'counters',resourceKind=kind==='meeting'?'meetings':'queueTickets';
 const masters=(await rows(db,'SELECT id,payload FROM masters WHERE kind=$1',[masterKind])).filter(r=>r.payload.active).map(r=>({...r.payload,id:r.id}));
 const records=(await rows(db,'SELECT id,published,updated_at FROM resources WHERE kind=$1 AND published IS NOT NULL',[resourceKind])).filter(r=>r.published.status==='published'&&r.published.visibleTo?.includes(profile.profileType)&&activeAt(r.published));
 if(!masters.length&&!records.length)return null;
 const availability='managed',now=Date.now();
 if(kind==='meeting'){const today=records.filter(r=>r.published.eventStart.slice(0,10)===new Date().toISOString().slice(0,10));return {availability,todayMeetings:today.length,ongoing:today.filter(r=>Date.parse(r.published.eventStart)<=now&&Date.parse(r.published.eventEnd)>now).length,upcoming:today.filter(r=>Date.parse(r.published.eventStart)>now).length,rooms:masters.map(m=>({name:m.name,status:records.some(r=>r.published.roomId===m.id&&Date.parse(r.published.eventStart)<=now&&Date.parse(r.published.eventEnd)>now)?'occupied':m.status})),schedule:today.sort((a,b)=>a.published.eventStart.localeCompare(b.published.eventStart)).map(r=>({time:r.published.eventStart,room:masters.find(m=>m.id===r.published.roomId)?.name||r.published.roomId,title:['public','vip','signage'].includes(profile.profileType)?r.published.publicTitle||'Reserved':r.published.title}))};}
 return {availability,servedToday:records.filter(r=>r.published.queueState==='served'&&new Date(r.updated_at).toISOString().slice(0,10)===new Date().toISOString().slice(0,10)).length,waiting:records.filter(r=>r.published.queueState==='waiting').length,activeCounters:masters.filter(m=>['available','serving'].includes(m.status)).length,calls:records.filter(r=>r.published.queueState==='calling').map(r=>({ticket:r.published.ticket,counter:masters.find(m=>m.id===r.published.counterId)?.name||r.published.counterId})),counters:masters.map(m=>({name:m.name,status:m.status}))};
}
