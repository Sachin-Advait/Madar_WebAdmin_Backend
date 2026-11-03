import {sha,check,uid,allowedPage,activeAt} from './domain.mjs';
import {one,rows} from './db.mjs';

export const preferenceModel='madar-interest-v1';
export const preferenceLimits={retentionDays:90,maxProgressPerDevice:500,maxSessionsPerDevice:500,sessionHours:8};
export function preferencePolicy(profile={}) {
 const p=profile.experience||{},staff=['employee','management'].includes(profile.profileType);
 return {historyMode:['off','session','device'].includes(p.historyMode)?p.historyMode:staff?'device':'off',recommendations:p.recommendations!==false,completionThreshold:typeof p.completionThreshold==='number'&&p.completionThreshold>=.8&&p.completionThreshold<=1?p.completionThreshold:.95};
}
export function checkPreferenceEpoch(screen,header){
 const current=Number(screen.preferences_epoch)||0;
 if((header===undefined||header===null||header==='')&&current===0)return;
 check(typeof header==='string'&&/^(0|[1-9]\d{0,15})$/.test(header)&&Number.isSafeInteger(Number(header))&&Number(header)===current,409,'Preferences were reset; refresh device configuration before changing saved state');
}

// Artwork, titles and catalogue revision counters deliberately do not reset resume.
export function playbackRevision(p={}) {
 return sha(JSON.stringify([p.videoRef||'',p.stationRef||'',p.streamRef||'',p.providerRef||'',p.mediaRevision||'']));
}
export function progressView(p) {
 return p?{kind:p.kind,id:p.resource_id,mediaRevision:p.media_revision,positionSeconds:Number(p.position_seconds),durationSeconds:Number(p.duration_seconds),completed:p.completed,updatedAt:p.updated_at}:null;
}
export async function clearDevicePreferences(db,screenId,{includeFavourites=true,bumpEpoch=true}={}) {
 await db.query('DELETE FROM playback_sessions WHERE screen_id=$1',[screenId]);
 await db.query('DELETE FROM device_progress WHERE screen_id=$1',[screenId]);
 if(includeFavourites)await db.query('DELETE FROM favourites WHERE screen_id=$1',[screenId]);
 if(bumpEpoch)await db.query('UPDATE screens SET preferences_epoch=preferences_epoch+1 WHERE id=$1',[screenId]);
}
export async function pruneDevicePreferences(db,screenId) {
 await db.query("DELETE FROM playback_sessions WHERE screen_id=$1 AND expires_at<=now()",[screenId]);
 await db.query("DELETE FROM device_progress WHERE screen_id=$1 AND updated_at<now()-interval '90 days'",[screenId]);
 await db.query('DELETE FROM device_progress WHERE screen_id=$1 AND (kind,resource_id,media_revision) IN (SELECT kind,resource_id,media_revision FROM device_progress WHERE screen_id=$1 ORDER BY updated_at DESC,kind,resource_id OFFSET 500)',[screenId]);
 await db.query('DELETE FROM playback_sessions WHERE screen_id=$1 AND id IN (SELECT id FROM playback_sessions WHERE screen_id=$1 ORDER BY created_at DESC,id DESC OFFSET 500)',[screenId]);
}
// Run periodically from the server, also safe to call from a maintenance job.
// Bounded deletes avoid a long transaction when a deployment resumes after downtime.
export async function purgeExpiredPreferences(db,limit=500) {
 check(Number.isInteger(limit)&&limit>0&&limit<=5000,422,'Invalid retention batch size');
 const sessions=await db.query('DELETE FROM playback_sessions WHERE id IN (SELECT id FROM playback_sessions WHERE expires_at<=now() ORDER BY expires_at LIMIT $1) RETURNING id',[limit]);
 const progress=await db.query("DELETE FROM device_progress WHERE (screen_id,kind,resource_id,media_revision) IN (SELECT screen_id,kind,resource_id,media_revision FROM device_progress WHERE updated_at<now()-interval '90 days' ORDER BY updated_at LIMIT $1) RETURNING screen_id",[limit]);
 return {sessions:sessions.rows.length,progress:progress.rows.length};
}
export async function preferenceContext(tx,screenId,{lock=true}={}) {
 const screen=await one(tx,'SELECT * FROM screens WHERE id=$1'+(lock?' FOR UPDATE':''),[screenId]);
 check(screen?.enabled,401,'Screen has been revoked');
 const current=await one(tx,'SELECT payload FROM profiles WHERE id=$1',[screen.profile_id]);
 const policy=preferencePolicy(current?.payload);
 if(policy.historyMode!=='device')await clearDevicePreferences(tx,screenId,{includeFavourites:false,bumpEpoch:false});
 await pruneDevicePreferences(tx,screenId);
 const release=await one(tx,'SELECT bundle FROM releases WHERE id=$1',[screen.desired_release]);
 // A freshly changed profile can be more restrictive than a release; intersect both.
 return {screen,policy,epoch:Number(screen.preferences_epoch)||0,profile:current?.payload,bundle:release?.bundle};
}
export function availableMedia(context,kind,id) {
 if(!['videos','replay'].includes(kind))return null;
 const {bundle,profile}=context;
 if(!bundle?.pages?.[kind]||!profile||!allowedPage(profile,kind)||!allowedPage(bundle.profile,kind))return null;
 return (bundle.content[kind]||[]).find(p=>p.id===id&&activeAt(p)&&p.status==='published'&&p.visibleTo?.includes(profile.profileType)&&(kind!=='replay'||p.available===true)&&(!(kind==='replay'&&p.eventEnd)||Date.parse(p.eventEnd)<=Date.now()))||null;
}
function eligibleCandidates(context,kind){
 const {bundle,profile}=context;
 if(!bundle?.pages?.[kind]||!profile||!allowedPage(profile,kind)||!allowedPage(bundle.profile,kind))return [];
 return (bundle.content[kind]||[]).filter(p=>activeAt(p)&&p.status==='published'&&p.visibleTo?.includes(profile.profileType)&&(kind!=='replay'||p.available===true)&&(!(kind==='replay'&&p.eventEnd)||Date.parse(p.eventEnd)<=Date.now()));
}
export function matchingProgress(context,list) {
 return list.filter(p=>{const media=availableMedia(context,p.kind,p.resource_id);return media&&media.mediaRevision===p.media_revision});
}
export async function beginPlayback(tx,context,input) {
 const item=availableMedia(context,input.kind,input.id);
 check(item,404,'Media is unavailable to this screen');
 check(item.mediaRevision&&item.mediaRevision===input.mediaRevision,409,'Media revision changed; refresh the catalogue');
 if(context.policy.historyMode!=='device')return {tracking:false,sessionId:null,sessionVersion:null,expiresAt:null,progress:null,policy:context.policy,epoch:context.epoch};
 const screenId=context.screen.id,current=await one(tx,'SELECT * FROM device_progress WHERE screen_id=$1 AND kind=$2 AND resource_id=$3 AND media_revision=$4 FOR UPDATE',[screenId,input.kind,input.id,input.mediaRevision]);
 const id=uid(),version=(current?.session_version||0)+1;
 const session=await one(tx,"INSERT INTO playback_sessions(id,screen_id,kind,resource_id,media_revision,session_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[id,screenId,input.kind,input.id,input.mediaRevision,version]);
 await tx.query('INSERT INTO device_progress(screen_id,kind,resource_id,media_revision,session_id,session_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(screen_id,kind,resource_id,media_revision) DO UPDATE SET session_id=$5,session_version=$6',[screenId,input.kind,input.id,input.mediaRevision,id,version]);
 // Replaced media cannot accumulate obsolete history on the device.
 await tx.query('DELETE FROM device_progress WHERE screen_id=$1 AND kind=$2 AND resource_id=$3 AND media_revision<>$4',[screenId,input.kind,input.id,input.mediaRevision]);
 await pruneDevicePreferences(tx,screenId);
 return {tracking:true,sessionId:id,sessionVersion:version,expiresAt:session.expires_at,progress:progressView(current),policy:context.policy,epoch:context.epoch};
}
export async function updatePlayback(tx,context,sessionId,input) {
 check(context.policy.historyMode==='device',409,'Persistent history is disabled for this screen');
 const session=await one(tx,'SELECT * FROM playback_sessions WHERE id=$1 AND screen_id=$2 FOR UPDATE',[sessionId,context.screen.id]);
 check(session,410,'Playback session expired or was reset');
 check(new Date(session.expires_at).getTime()>Date.now(),410,'Playback session expired');
 const item=availableMedia(context,session.kind,session.resource_id);
 check(item,404,'Media is unavailable to this screen');
 check(item.mediaRevision===session.media_revision,409,'Media revision changed; refresh the catalogue');
 const current=await one(tx,'SELECT * FROM device_progress WHERE screen_id=$1 AND kind=$2 AND resource_id=$3 AND media_revision=$4 FOR UPDATE',[context.screen.id,session.kind,session.resource_id,session.media_revision]);
 check(current?.session_id===session.id,409,'A newer playback session superseded this one');
 if(input.sequence===session.last_sequence){check(JSON.stringify(session.last_payload)===JSON.stringify(input)||sameCheckpoint(session.last_payload,input),409,'Sequence was already used for a different checkpoint');return {ok:true,duplicate:true,progress:progressView(current)}}
 check(input.sequence>session.last_sequence,409,'A newer checkpoint was already accepted');
 const position=Math.min(input.positionSeconds,input.durationSeconds),completed=position/input.durationSeconds>=context.policy.completionThreshold;
 // Seek jumps do not count as watched time. Count at most elapsed wall time + 2s jitter.
 const elapsed=Math.max(0,(Date.now()-new Date(session.updated_at).getTime())/1000)+2;
 const delta=session.last_position==null?0:Math.max(0,Math.min(position-Number(session.last_position),elapsed));
 const p=await one(tx,'UPDATE device_progress SET position_seconds=$5,duration_seconds=$6,completed=$7,watched_seconds=LEAST(watched_seconds+$8,604800),updated_at=now() WHERE screen_id=$1 AND kind=$2 AND resource_id=$3 AND media_revision=$4 RETURNING *',[context.screen.id,session.kind,session.resource_id,session.media_revision,position,input.durationSeconds,completed,delta]);
 await tx.query('UPDATE playback_sessions SET last_sequence=$2,last_payload=$3,last_position=$4,updated_at=now() WHERE id=$1',[session.id,input.sequence,JSON.stringify(input),position]);
 return {ok:true,duplicate:false,progress:progressView(p)};
}
function sameCheckpoint(a,b){return a&&['sequence','positionSeconds','durationSeconds','event'].every(k=>a[k]===b[k])}
function featureTokens(item){
 const values=[['category',item.category],['language',item.language],...(Array.isArray(item.tags)?item.tags.slice(0,12).map(t=>['tag',t]):[])];
 return values.filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>[k+':'+v.trim().toLowerCase().slice(0,80),v.trim().slice(0,80)]);
}
export function rankRecommendations(context,progress=[],favourites=[],{limit=12,now=Date.now()}={}) {
 const {policy}=context;
 if(!policy.recommendations)return {model:preferenceModel,personalized:false,items:[]};
 const candidates=['videos','replay'].flatMap(kind=>eligibleCandidates(context,kind).map(item=>({kind,item})));
 const interests=new Map(),labels=new Map(),completed=new Set(),favouriteKeys=new Set();
 const add=(item,weight)=>{for(const [token,label] of featureTokens(item)){const multiplier=token.startsWith('language:') ? .35 : token.startsWith('tag:') ? .7 : 1;interests.set(token,(interests.get(token)||0)+weight*multiplier);labels.set(token,label)}};
 if(policy.historyMode==='device'){
  for(const p of matchingProgress(context,progress)){
   const item=availableMedia(context,p.kind,p.resource_id),age=Math.max(0,(now-new Date(p.updated_at).getTime())/86400000),decay=Math.pow(.5,age/30);
   const engagement=Math.min(1,Number(p.watched_seconds)/Math.max(60,Number(p.duration_seconds)));
   const weight=(engagement*2+(p.completed?1:0))*decay;
   if(weight>.01)add(item,weight);
   if(p.completed)completed.add(p.kind+':'+p.resource_id);
  }
  for(const f of favourites){const item=availableMedia(context,f.kind,f.resource_id);if(!item)continue;const age=Math.max(0,(now-new Date(f.created_at).getTime())/86400000);add(item,3*Math.pow(.5,age/30));favouriteKeys.add(f.kind+':'+f.resource_id)}
 }
 const personalized=interests.size>0;
 const scored=candidates.map(({kind,item})=>{
  let score=item.featured?1:.25,best=null,bestWeight=0;
  // Learning is based only on this device, never on other viewers' raw history.
  for(const [token] of featureTokens(item)){const weight=interests.get(token)||0;score+=weight;if(weight>bestWeight){best=token;bestWeight=weight}}
  if(completed.has(kind+':'+item.id))score*=.25;
  if(favouriteKeys.has(kind+':'+item.id))score*=.8;
  return {kind,id:item.id,score,reason:best?`Based on this device's interest in ${labels.get(best)}`:item.featured?'Featured by your content team':'Explore your available catalogue',category:String(item.category||''),sortOrder:Number(item.sortOrder)||0};
 }).sort((a,b)=>b.score-a.score||a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
 // Greedy reranking discounts repeated categories; no hard exclusions on small catalogues.
 const output=[],seen=new Map();
 while(scored.length&&output.length<limit){let pick=0,best=-Infinity;for(let i=0;i<scored.length;i++){const score=scored[i].score/(1+.4*(seen.get(scored[i].category)||0));if(score>best){best=score;pick=i}}const chosen=scored.splice(pick,1)[0];seen.set(chosen.category,(seen.get(chosen.category)||0)+1);output.push({kind:chosen.kind,id:chosen.id,score:Number(best.toFixed(4)),reason:chosen.reason})}
 return {model:preferenceModel,personalized,items:output};
}
