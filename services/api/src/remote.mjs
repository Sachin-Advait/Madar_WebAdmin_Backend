// Phone remote ("MADAR Control Centre").
//
// 1. The TV asks for a six-digit code (POST /api/app/remote/code) and shows it.
// 2. A staff phone sends that code (POST /api/remote/pair) and gets a secret
//    phone token. The pairing waits for an admin to approve it in Admin Studio
//    → Phone Remotes, unless MADAR_REMOTE_APPROVAL=0.
// 3. The phone opens the Socket.IO namespace /remote with that token and sends
//    `command` events (up, down, left, right, ok, back, home, playPause).
//    The server forwards each one to that TV's socket as `remote-command` with
//    a 2.5 s deadline and returns how many TVs applied it.
// Pairings are stored in the database, so they survive restarts.
import crypto from 'node:crypto';
import {z} from 'zod';
import {one,rows} from './db.mjs';
import {uid,secret,sha,check} from './domain.mjs';
import {audit} from './releases.mjs';

export const remoteActions=['up','down','left','right','ok','back','home','playPause'];
export const CODE_SECONDS=120,PENDING_MINUTES=5,COMMAND_MS=2500;
export const remoteApprovalRequired=()=>process.env.MADAR_REMOTE_APPROVAL!=='0';
export const remoteGrantHours=()=>{const h=Number(process.env.MADAR_REMOTE_GRANT_HOURS||12);return Number.isFinite(h)&&h>0?Math.min(h,24*30):12};
const codeHash=code=>sha('remote-code:'+code);

const select=`SELECT p.*,s.payload->>'name' AS screen_name,s.enabled AS screen_enabled FROM remote_pairings p JOIN screens s ON s.id=p.screen_id`;

/** Ends pairings whose time is up; returns nothing. */
export async function expireRemotePairings(db){
  return rows(db,"UPDATE remote_pairings SET status='ended',end_reason='expired',ended_at=now() WHERE status IN ('pending','active') AND expires_at<=now() RETURNING id");
}

export async function pairingByToken(db,token){
  if(typeof token!=='string'||token.length<20)return null;
  return one(db,select+' WHERE p.token_hash=$1',[sha(token)]);
}

export async function pairingById(db,id){return one(db,select+' WHERE p.id=$1',[id])}

/** What a phone is told about its pairing. */
export function phoneView(p,online=false){
  const ended=p.status==='ended'||(['pending','active'].includes(p.status)&&new Date(p.expires_at)<=new Date());
  return {pairingId:p.id,status:ended?'ended':p.status,reason:ended?(p.end_reason||'expired'):null,tvId:p.screen_id,tvName:p.screen_name||'TV',label:p.label,expiresAt:new Date(p.expires_at).toISOString(),online:Boolean(online&&p.screen_enabled)};
}

const adminView=(p,online)=>({id:p.id,tvId:p.screen_id,tvName:p.screen_name||'TV',label:p.label,status:p.status,createdAt:p.created_at,approvedAt:p.approved_at,expiresAt:p.expires_at,decidedBy:p.decided_by,endedAt:p.ended_at,endReason:p.end_reason,tvOnline:Boolean(online)});

export function registerRemoteRoutes(app,{db,admin,wrap,limiter}){
  const events=app.locals.events;
  // Set by server.mjs once Socket.IO is running; false in tests without sockets.
  app.locals.remoteOnline??=async()=>false;
  const online=id=>app.locals.remoteOnline(id).catch(()=>false);

  // TV (device key): new code for this screen; replaces the screen's last code.
  app.post('/api/app/remote/code',wrap(async(req,res)=>{
    let code='';
    for(let i=0;i<8&&!code;i++){
      const next=String(crypto.randomInt(0,1000000)).padStart(6,'0');
      try{await db.query(`INSERT INTO remote_codes(screen_id,code_hash,expires_at) VALUES($1,$2,now()+interval '${CODE_SECONDS} seconds') ON CONFLICT(screen_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at`,[req.screen.id,codeHash(next)]);code=next}
      catch(e){if(e.code!=='23505')throw e}
    }
    check(code,503,'Could not make a pairing code, try again');
    res.status(201).json({code,ttl:CODE_SECONDS,approvalRequired:remoteApprovalRequired()});
  }));

  // TV: phones paired with this screen (shown in the TV's remote settings).
  app.get('/api/app/remote/pairings',wrap(async(req,res)=>{
    await expireRemotePairings(db);
    const list=await rows(db,select+" WHERE p.screen_id=$1 AND p.status IN ('pending','active') ORDER BY p.created_at DESC",[req.screen.id]);
    res.json(list.map(p=>({id:p.id,label:p.label,status:p.status,expiresAt:p.expires_at})));
  }));

  // Phone: exchange a TV code for a phone token.
  const pairSchema=z.object({code:z.string().regex(/^\d{6}$/,'Enter the six digits shown on the TV'),label:z.string().trim().max(60).optional()}).strict();
  app.post('/api/remote/pair',limiter('madar:remote-pair:',10),wrap(async(req,res)=>{
    const p=pairSchema.parse(req.body);
    const approval=remoteApprovalRequired();
    const id=uid(),token=secret(),label=p.label||'Staff phone';
    const created=await db.tx(async tx=>{
      const c=await one(tx,'DELETE FROM remote_codes WHERE code_hash=$1 RETURNING *',[codeHash(p.code)]);
      check(c&&new Date(c.expires_at)>new Date(),422,'That code is wrong or has expired. Show a new code on the TV.');
      const s=await one(tx,'SELECT id,enabled FROM screens WHERE id=$1',[c.screen_id]);
      check(s?.enabled,422,'That TV is not active');
      const status=approval?'pending':'active';
      const expires=approval?`now()+interval '${PENDING_MINUTES} minutes'`:`now()+interval '${remoteGrantHours()} hours'`;
      await tx.query(`INSERT INTO remote_pairings(id,screen_id,label,status,token_hash,expires_at,approved_at) VALUES($1,$2,$3,$4,$5,${expires},${approval?'NULL':'now()'})`,[id,s.id,label,status,sha(token)]);
      await audit(tx,'phone:'+label,'remote-pair','screen',s.id,{pairingId:id,status});
      return pairingById(tx,id);
    });
    events.emit('remote',{kind:'paired',pairingId:id,screenId:created.screen_id,approvalPending:approval,label});
    res.status(201).json({token,...phoneView(created,await online(created.screen_id))});
  }));

  const phone=async req=>{
    const token=req.get('Authorization')?.replace(/^Bearer /,'');
    const p=await pairingByToken(db,token);check(p,401,'This phone is not paired');return p;
  };
  app.get('/api/remote/session',wrap(async(req,res)=>{await expireRemotePairings(db);const p=await phone(req);res.json(phoneView(p,await online(p.screen_id)))}));
  app.post('/api/remote/unpair',wrap(async(req,res)=>{
    const p=await phone(req);
    await db.query("UPDATE remote_pairings SET status='ended',end_reason=$2,ended_at=now() WHERE id=$1 AND status IN ('pending','active')",[p.id,p.status==='pending'?'cancelled':'unpaired']);
    events.emit('remote',{kind:'ended',pairingId:p.id,screenId:p.screen_id});
    res.json({ok:true});
  }));

  // Admin Studio → Phone Remotes.
  app.get('/api/admin/remote-pairings',admin('viewer'),wrap(async(req,res)=>{
    await expireRemotePairings(db);
    const list=await rows(db,select+" WHERE p.status IN ('pending','active') OR p.ended_at>now()-interval '1 day' ORDER BY p.created_at DESC LIMIT 300");
    const status=new Map();for(const id of new Set(list.map(p=>p.screen_id)))status.set(id,await online(id));
    res.json({approvalRequired:remoteApprovalRequired(),grantHours:remoteGrantHours(),pairings:list.map(p=>adminView(p,status.get(p.screen_id)))});
  }));
  const decide=(path,from,to,reason,action)=>app.post(`/api/admin/remote-pairings/:id/${path}`,admin('admin'),wrap(async(req,res)=>{
    await expireRemotePairings(db);
    const set=to==='active'?`status='active',approved_at=now(),expires_at=now()+interval '${remoteGrantHours()} hours'`:`status='ended',end_reason='${reason}',ended_at=now()`;
    const p=await one(db,`UPDATE remote_pairings SET ${set},decided_by=$2 WHERE id=$1 AND status=$3 RETURNING *`,[req.params.id,req.user.email,from]);
    if(!p){check(await one(db,'SELECT id FROM remote_pairings WHERE id=$1',[req.params.id]),404,'Pairing not found');check(false,409,'This pairing has already changed. Refresh the list.')}
    await audit(db,req.user.email,action,'remote-pairing',p.id,{screenId:p.screen_id,label:p.label});
    events.emit('remote',{kind:to==='active'?'approved':'ended',pairingId:p.id,screenId:p.screen_id});
    res.json({ok:true});
  }));
  decide('approve','pending','active',null,'approve-remote');
  decide('reject','pending','ended','rejected','reject-remote');
  decide('revoke','active','ended','revoked','revoke-remote');
}

/**
 * Socket.IO side: the /remote namespace for phones, and command delivery to
 * the TV sockets (default namespace, one room per screen id).
 */
export function attachRemote({io,db,events,app,logger}){
  const tvs=io.of('/');
  const online=async screenId=>(await tvs.in(screenId).fetchSockets()).length>0;
  app.locals.remoteOnline=online;
  const phones=io.of('/remote');
  phones.use(async(socket,next)=>{
    try{
      await expireRemotePairings(db);
      const p=await pairingByToken(db,socket.handshake.auth?.token);
      if(!p||p.status==='ended')return next(Error('This phone is not paired'));
      socket.data.pairingId=p.id;socket.data.screenId=p.screen_id;next();
    }catch(e){next(Error('Remote unavailable'))}
  });
  const sendStatus=async target=>{
    const p=await pairingById(db,target.data?.pairingId??target);
    if(!p)return;
    const view=phoneView(p,await online(p.screen_id));
    phones.to('p:'+p.id).emit('status',view);
    if(view.status==='ended')phones.in('p:'+p.id).disconnectSockets(true);
  };
  const refreshScreen=async screenId=>{
    const list=await rows(db,"SELECT id FROM remote_pairings WHERE screen_id=$1 AND status IN ('pending','active')",[screenId]);
    for(const p of list)await sendStatus(p.id);
  };
  phones.on('connection',async socket=>{
    socket.join('p:'+socket.data.pairingId);
    let windowStart=Date.now(),count=0;
    socket.on('command',async(msg,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{};
      try{
        if(Date.now()-windowStart>1000){windowStart=Date.now();count=0}
        if(++count>35)return reply({error:'Too many presses'});
        const action=msg?.action;
        if(!remoteActions.includes(action))return reply({error:'Unknown control'});
        const p=await pairingById(db,socket.data.pairingId);
        if(!p||p.status!=='active'||new Date(p.expires_at)<=new Date()||!p.screen_enabled){await sendStatus(socket);return reply({error:'This phone is not allowed to control the TV'})}
        const expiresAt=Date.now()+COMMAND_MS;
        const id=uid();
        let answers=[],unavailable=0;
        const targets=(await tvs.in(p.screen_id).fetchSockets()).length;
        if(targets){
          answers=await new Promise(resolve=>tvs.to(p.screen_id).timeout(COMMAND_MS).emit('remote-command',{id,action,expiresAt},(_err,responses)=>resolve(Array.isArray(responses)?responses:[])));
          unavailable=Math.max(0,targets-answers.length);
        }
        const applied=answers.filter(a=>a?.outcome==='applied').length;
        reply({id:msg?.id??null,applied,blocked:answers.length-applied,unavailable,total:targets});
      }catch(e){logger?.warn({message:e.message},'Remote command failed');reply({error:'Remote unavailable'})}
    });
    socket.on('unpair',async(_msg,ack)=>{
      const p=await pairingById(db,socket.data.pairingId);
      if(p&&['pending','active'].includes(p.status))await db.query("UPDATE remote_pairings SET status='ended',end_reason=$2,ended_at=now() WHERE id=$1 AND status IN ('pending','active')",[p.id,p.status==='pending'?'cancelled':'unpaired']);
      events.emit('remote',{kind:'ended',pairingId:p?.id,screenId:p?.screen_id});
      if(typeof ack==='function')ack({ok:true});
    });
    await sendStatus(socket).catch(()=>{});
  });
  events.on('remote',async e=>{
    try{
      if(e.pairingId)await sendStatus(e.pairingId);
      if(e.kind==='paired')tvs.to(e.screenId).emit('remote-paired',{approvalPending:e.approvalPending,label:e.label});
    }catch(err){logger?.warn({message:err.message},'Remote status update failed')}
  });
  // TVs going on or offline: tell their phones.
  tvs.on('connection',socket=>{
    const id=socket.data.screenId;refreshScreen(id).catch(()=>{});
    socket.on('disconnect',()=>setTimeout(()=>refreshScreen(id).catch(()=>{}),50));
  });
  // Pairings that time out are ended once a minute.
  const timer=setInterval(async()=>{try{for(const p of await expireRemotePairings(db))await sendStatus(p.id)}catch{}},60000);
  timer.unref?.();
  return {online,stop:()=>clearInterval(timer)};
}
