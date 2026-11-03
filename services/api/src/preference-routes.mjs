import {z} from 'zod';
import {check} from './domain.mjs';
import {one,rows} from './db.mjs';
import {audit} from './releases.mjs';
import {preferenceModel,preferenceLimits,preferencePolicy,preferenceContext,progressView,matchingProgress,beginPlayback,updatePlayback,rankRecommendations,clearDevicePreferences,checkPreferenceEpoch} from './preferences.mjs';

const start=z.object({kind:z.enum(['videos','replay']),id:z.string().min(1).max(120),mediaRevision:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const checkpoint=z.object({sequence:z.number().int().min(1).max(2147483647),positionSeconds:z.number().finite().min(0).max(604800),durationSeconds:z.number().finite().positive().max(604800),event:z.enum(['checkpoint','pause','ended']).default('checkpoint')}).strict().refine(p=>p.positionSeconds<=p.durationSeconds+2,{message:'Position cannot exceed media duration'});
const privateResponse=res=>res.set('Cache-Control','no-store, private');

export function registerPreferenceRoutes(app,{db,admin,device,wrap}) {
 app.get('/api/app/preferences',device,wrap(async(req,res)=>{
  const response=await db.tx(async tx=>{const context=await preferenceContext(tx,req.screen.id);const list=context.policy.historyMode==='device'?await rows(tx,'SELECT * FROM device_progress WHERE screen_id=$1 ORDER BY updated_at DESC LIMIT 500',[req.screen.id]):[];return {policy:context.policy,epoch:context.epoch,progress:matchingProgress(context,list).map(progressView)}});
  privateResponse(res).json(response);
 }));
 app.post('/api/app/playback-sessions',device,wrap(async(req,res)=>{
  const input=start.parse(req.body);
  const response=await db.tx(async tx=>{const context=await preferenceContext(tx,req.screen.id);checkPreferenceEpoch(context.screen,req.get('X-Preferences-Epoch'));return beginPlayback(tx,context,input)});
  privateResponse(res).status(response.tracking?201:200).json(response);
 }));
 app.put('/api/app/playback-sessions/:sessionId',device,wrap(async(req,res)=>{
  const input=checkpoint.parse(req.body);
  const response=await db.tx(async tx=>updatePlayback(tx,await preferenceContext(tx,req.screen.id),req.params.sessionId,input));
  privateResponse(res).json(response);
 }));
 app.get('/api/app/recommendations',device,wrap(async(req,res)=>{
  const limit=z.coerce.number().int().min(1).max(24).default(12).parse(req.query.limit);
  const response=await db.tx(async tx=>{
   const context=await preferenceContext(tx,req.screen.id);
   const progress=context.policy.historyMode==='device'?await rows(tx,'SELECT * FROM device_progress WHERE screen_id=$1 ORDER BY updated_at DESC LIMIT 500',[req.screen.id]):[];
   const favourites=context.policy.historyMode==='device'?await rows(tx,'SELECT * FROM favourites WHERE screen_id=$1 ORDER BY created_at DESC LIMIT 200',[req.screen.id]):[];
   return rankRecommendations(context,progress,favourites,{limit});
  });privateResponse(res).json(response);
 }));
 app.delete('/api/app/preferences',device,wrap(async(req,res)=>{
  await db.tx(async tx=>{const screen=await one(tx,'SELECT enabled FROM screens WHERE id=$1 FOR UPDATE',[req.screen.id]);check(screen?.enabled,401,'Screen has been revoked');await clearDevicePreferences(tx,req.screen.id)});
  privateResponse(res).json({ok:true});
 }));
 app.delete('/api/admin/screens/:id/preferences',admin('admin'),wrap(async(req,res)=>{
  await db.tx(async tx=>{check(await one(tx,'SELECT id FROM screens WHERE id=$1 FOR UPDATE',[req.params.id]),404,'Screen not found');await clearDevicePreferences(tx,req.params.id);await audit(tx,req.user.email,'reset-preferences','screen',req.params.id)});
  res.json({ok:true});
 }));
 app.get('/api/admin/recommendation-summary',admin('viewer'),wrap(async(req,res)=>{
  const policies=(await rows(db,'SELECT p.payload FROM screens s JOIN profiles p ON p.id=s.profile_id WHERE s.enabled=true')).map(s=>preferencePolicy(s.payload));
  const stored=await one(db,"SELECT (SELECT count(DISTINCT screen_id)::integer FROM device_progress WHERE updated_at>=now()-interval '90 days' AND duration_seconds>0) AS devices,(SELECT count(*)::integer FROM device_progress WHERE updated_at>=now()-interval '90 days' AND duration_seconds>0) AS items,(SELECT count(*)::integer FROM playback_sessions s JOIN device_progress p ON p.session_id=s.id WHERE s.expires_at>now()) AS sessions");
  res.json({model:preferenceModel,algorithm:'Explainable content-based interest ranking',retentionDays:preferenceLimits.retentionDays,maxProgressPerDevice:preferenceLimits.maxProgressPerDevice,devices:{total:policies.length,persistent:policies.filter(p=>p.historyMode==='device').length,session:policies.filter(p=>p.historyMode==='session').length,off:policies.filter(p=>p.historyMode==='off').length,recommendationsEnabled:policies.filter(p=>p.recommendations).length},stored:{devicesWithHistory:stored.devices,progressItems:stored.items,activeSessions:stored.sessions},features:['category','language','tags'],externalAi:false});
 }));
}
