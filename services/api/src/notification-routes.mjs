// Full-screen TV notifications: send now to all or chosen screens, auto-dismiss
// after a duration, optional sound, cancel, and send history. Separate from the
// published "Priority Alerts" collection, which is still available and can be
// filled from the same form (addToPriorityAlerts).
import {z} from 'zod';
import {one,rows} from './db.mjs';
import {uid,check,profileTypes,validateResource} from './domain.mjs';
import {contentFields,extendedSchema,validateExtra} from './cms.mjs';
import {audit,releaseAll} from './releases.mjs';

export const notificationCategories=['EMERGENCY','WARNING','INFO','ANNOUNCEMENT','CELEBRATION'];
const severity={EMERGENCY:'critical',WARNING:'warning',INFO:'info',ANNOUNCEMENT:'info',CELEBRATION:'info'};

const sendSchema=z.object({
  title:z.string().trim().min(2).max(120),
  message:z.string().trim().max(500).default(''),
  category:z.enum(notificationCategories),
  durationSeconds:z.number().int().min(5).max(120),
  playSound:z.boolean().default(true),
  screenIds:z.array(z.string().min(1).max(100)).max(500).default([]),
  addToPriorityAlerts:z.boolean().default(false),
  alertEndAt:z.string().max(40).optional(),
}).strict();

const view=r=>({id:r.id,title:r.title,message:r.message,category:r.category,durationSeconds:r.duration_seconds,playSound:r.play_sound,screenIds:r.screen_ids||[],status:r.status==='sent'&&new Date(r.expires_at)<=new Date()?'expired':r.status,alertId:r.alert_id||null,createdBy:r.created_by,createdAt:r.created_at,expiresAt:r.expires_at,cancelledBy:r.cancelled_by,cancelledAt:r.cancelled_at});

export function registerNotificationRoutes(app,{db,admin,device,wrap}){
  app.get('/api/admin/notifications',admin('viewer'),wrap(async(req,res)=>{
    res.json((await rows(db,'SELECT * FROM tv_notifications ORDER BY created_at DESC LIMIT 200')).map(view));
  }));

  app.post('/api/admin/notifications',admin('admin'),wrap(async(req,res)=>{
    const p=sendSchema.parse(req.body);
    const screenIds=[...new Set(p.screenIds)];
    if(p.alertEndAt)check(!Number.isNaN(Date.parse(p.alertEndAt))&&Date.parse(p.alertEndAt)>Date.now(),422,'Priority alert end time must be a future date');
    const id=uid();
    const result=await db.tx(async tx=>{
      if(screenIds.length){
        const found=await rows(tx,'SELECT id FROM screens WHERE id = ANY($1::text[])',[screenIds]);
        check(found.length===screenIds.length,422,'One or more selected screens no longer exist');
      }
      let alertId=null;
      if(p.addToPriorityAlerts){
        alertId=uid();
        const alert={title:p.title,titleAr:'',description:p.message,category:p.category[0]+p.category.slice(1).toLowerCase(),image:'',status:'published',sortOrder:0,visibleTo:profileTypes,startAt:new Date().toISOString(),endAt:new Date(p.alertEndAt?Date.parse(p.alertEndAt):Date.now()+24*3600000).toISOString(),severity:severity[p.category],fullScreenOverride:false};
        await tx.query("INSERT INTO content_types(kind) VALUES('alerts') ON CONFLICT DO NOTHING");
        const fields=await contentFields(tx,'alerts'),valid=validateResource('alerts',alert,extendedSchema('alerts',fields));validateExtra(fields,valid);
        await tx.query('INSERT INTO resources(kind,id,draft,published) VALUES($1,$2,$3,$3)',['alerts',alertId,JSON.stringify(valid)]);
        await releaseAll(tx,'Content published: '+p.title);
        await audit(tx,req.user.email,'publish','alerts',alertId,{title:p.title,from:'notification'});
      }
      const r=await one(tx,"INSERT INTO tv_notifications(id,title,message,category,duration_seconds,play_sound,screen_ids,alert_id,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+($5::integer * interval '1 second')) RETURNING *",[id,p.title,p.message,p.category,p.durationSeconds,p.playSound,JSON.stringify(screenIds),alertId,req.user.email]);
      await audit(tx,req.user.email,'send-notification','notification',id,{title:p.title,category:p.category,screens:screenIds.length||'all'});
      return r;
    });
    res.status(201).json(view(result));
  }));

  app.post('/api/admin/notifications/:id/cancel',admin('admin'),wrap(async(req,res)=>{
    const r=await one(db,"UPDATE tv_notifications SET status='cancelled',cancelled_by=$2,cancelled_at=now() WHERE id=$1 AND status='sent' RETURNING *",[req.params.id,req.user.email]);
    check(r,409,'Notification is not active or was already cancelled');
    await audit(db,req.user.email,'cancel-notification','notification',r.id,{title:r.title});
    res.json(view(r));
  }));

  // Polled by TVs every few seconds; small and uncached.
  app.get('/api/app/notifications',device,wrap(async(req,res)=>{
    const list=await rows(db,"SELECT id,title,message,category,duration_seconds,play_sound,created_at,expires_at FROM tv_notifications WHERE status='sent' AND expires_at>now() AND (screen_ids='[]'::jsonb OR screen_ids ? $1) ORDER BY created_at DESC LIMIT 5",[req.screen.id]);
    res.json({serverTime:new Date().toISOString(),notifications:list.map(r=>({id:r.id,title:r.title,message:r.message,category:r.category,durationSeconds:r.duration_seconds,playSound:r.play_sound,createdAt:r.created_at,expiresAt:r.expires_at}))});
  }));
}
