import crypto from 'node:crypto';
import {promisify} from 'node:util';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import raw from '../../../shared/catalog.json' with {type:'json'};
import {validateExperience} from './experience-config.mjs';
import {HUB_LAYOUT_PAGE,validateHubLayout} from './hub-layout.mjs';
export const catalog=structuredClone(raw);
for(const layout of Object.values(catalog.defaults)){let y=0,half=false;for(const section of layout.sections){if(catalog.widgets[section.type].grid){section.layout={x:half?6:0,y,w:6,h:4};if(half)y+=4;half=!half}else{if(half)y+=4;half=false;section.layout={x:0,y,w:12,h:4};y+=4}}}
// Daily Tasks: the KPI cards sit above a full-width, taller table of unfinished tasks.
for(const s of catalog.defaults['info-tasks'].sections)s.layout=s.type==='task_list'?{x:0,y:3,w:12,h:6}:{x:0,y:0,w:12,h:3};
export const uid=()=>crypto.randomUUID();
export const secret=()=>crypto.randomBytes(32).toString('base64url');
export const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export class Problem extends Error {constructor(status,message){super(message);this.status=status}}
export const check=(ok,status,msg)=>{if(!ok)throw new Problem(status,msg)};
export const roles={viewer:0,editor:1,admin:2};
export const profileTypes=['public','employee','management','vip','signage'];
const scrypt=promisify(crypto.scrypt);
export async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex')}
export async function verifyPassword(password,stored){const [salt,hex]=stored.split(':');const computed=await scrypt(password,salt,64);return crypto.timingSafeEqual(computed,Buffer.from(hex,'hex'))}
export function validPassword(p){check(typeof p==='string'&&p.length>=14&&p.length<=256,422,'Password must be 14–256 characters')}
for(const schema of Object.values(catalog.resourceSchemas)){
  schema.properties.visibleTo.items.enum=profileTypes;
  schema.properties.visibleTo.default=profileTypes;
  schema.properties.status.enum=['draft','review','published','disabled'];
  schema.properties.descriptionAr={type:'string',title:'Arabic description'};
  schema.properties.locationId={type:'string',title:'Location ID (optional)'};
  schema.properties.owner={type:'string',title:'Content owner / department'};
  schema.properties.title.maxLength=180;
  schema.properties.description.maxLength=5000;
  schema.properties.descriptionAr.maxLength=5000;
  schema.additionalProperties=false;
}
Object.assign(catalog.resourceSchemas.services.properties,{contact:{type:'string',title:'Contact details'},hours:{type:'string',title:'Service hours'}});
Object.assign(catalog.resourceSchemas.visitor.properties,{accessibility:{type:'string',title:'Accessibility / step-free access'},contact:{type:'string',title:'Contact desk'}});
Object.assign(catalog.resourceSchemas.events.properties,{registrationUrl:{type:'string',title:'Registration URL'},audience:{type:'string',title:'Audience'}});
Object.assign(catalog.resourceSchemas.notices.properties,{referenceNumber:{type:'string',title:'Notice reference'},department:{type:'string',title:'Issuing department'}});
Object.assign(catalog.resourceSchemas.alerts.properties,{instructions:{type:'string',title:'What viewers should do'}});
const common=structuredClone(catalog.resourceSchemas.notices);
for(const [kind,label,properties,required] of [
 ['programmes','Programme Guide',{channelId:{type:'string',title:'Channel ID'},eventStart:{type:'string',title:'Broadcast starts (ISO date/time)'},eventEnd:{type:'string',title:'Broadcast ends (ISO date/time)'},replayId:{type:'string',title:'Replay content ID (optional)'}},['channelId','eventStart','eventEnd']],
 ['meetings','Meeting Schedule',{roomId:{type:'string',title:'Room ID'},eventStart:{type:'string',title:'Meeting starts (ISO date/time)'},eventEnd:{type:'string',title:'Meeting ends (ISO date/time)'},organizer:{type:'string',title:'Organizer'},publicTitle:{type:'string',title:'Public title',default:'Reserved'}},['roomId','eventStart','eventEnd']],
 ['queueTickets','Queue Tickets',{ticket:{type:'string',title:'Ticket number',maxLength:30},counterId:{type:'string',title:'Counter ID'},queueState:{type:'string',enum:['waiting','calling','served'],default:'waiting'}},['ticket','counterId','queueState']]
]){catalog.resources[kind]={label,icon:'calendar'};catalog.resourceSchemas[kind]={...structuredClone(common),properties:{...structuredClone(common.properties),...properties},required:[...new Set([...(common.required||[]),...required])]};}
catalog.widgets.epg_guide.source='programmes';
for(const kind of ['channels','videos','replay','radio','featured','programmes'])Object.assign(catalog.resourceSchemas[kind].properties,{
 bannerMode:{type:'string',title:'Banner content mode',enum:['auto','override','manual'],default:'auto'},
 bannerTitle:{type:'string',title:'Banner title override',maxLength:180},bannerTitleAr:{type:'string',title:'Arabic banner title',maxLength:180},
 bannerDescription:{type:'string',title:'Banner summary override',maxLength:500},bannerDescriptionAr:{type:'string',title:'Arabic banner summary',maxLength:500},
 landscapeImage:{type:'string',title:'Landscape banner artwork (16:9)'},portraitImage:{type:'string',title:'Portrait banner artwork (2:3 or 9:16)'},
 focalX:{type:'number',title:'Image focal point X (0 = left, 1 = right)',minimum:0,maximum:1,default:0.5},
 focalY:{type:'number',title:'Image focal point Y (0 = top, 1 = bottom)',minimum:0,maximum:1,default:0.5},
 tags:{type:'array',title:'Interest tags',items:{type:'string',minLength:1,maxLength:50},uniqueItems:true,maxItems:12}
});
for(const kind of ['videos','replay'])catalog.resourceSchemas[kind].properties.mediaRevision={type:'string',title:'Media version (change when provider replaces the video)',maxLength:100};
Object.assign(catalog.resourceSchemas.replay.properties,{eventStart:{type:'string',title:'Original broadcast start (ISO datetime)'},eventEnd:{type:'string',title:'Original broadcast end (ISO datetime)'},durationSeconds:{type:'integer',minimum:0,title:'Duration in seconds'},language:{type:'string',title:'Language'}});
const ajv=new Ajv({allErrors:true,strict:false});addFormats(ajv);
const validators=Object.fromEntries(Object.entries(catalog.resourceSchemas).map(([k,s])=>[k,ajv.compile(s)]));
const widgetValidators=Object.fromEntries(Object.entries(catalog.widgets).map(([k,s])=>[k,ajv.compile(s.schema)]));
export function validateResource(kind,input,schema){check(validators[kind],404,'Unknown content type');const p=structuredClone(input||{});delete p.id;delete p.revision;delete p.createdAt;delete p.updatedAt;delete p.publishedStatus;const validate=schema?ajv.compile(schema):validators[kind];check(validate(p),422,ajv.errorsText(validate.errors));
 for(const k of ['startAt','endAt','eventStart','eventEnd'])if(p[k])check(Number.isFinite(Date.parse(p[k])),422,'Invalid date: '+k);
 if(p.startAt&&p.endAt)check(Date.parse(p.endAt)>Date.parse(p.startAt),422,'Expiry must be after start');
 if(p.eventStart&&p.eventEnd)check(Date.parse(p.eventEnd)>Date.parse(p.eventStart),422,'Event end must follow start');
 for(const k of ['image','landscapeImage','portraitImage','attachmentUrl','serviceUrl','directionUrl','registrationUrl'])if(p[k])check(/^https:\/\//i.test(p[k])||/^\/api\/assets\/[a-f0-9-]+$/.test(p[k])||/^\/art\/[a-z0-9-]+\.svg$/.test(p[k]),422,'Use an HTTPS URL or uploaded asset for '+k);
 if(p.status==='published'){
   if(kind==='alerts')check(p.endAt,422,'Alerts require an expiry date');
   if(kind==='events')check(p.eventStart&&p.eventEnd&&p.venue,422,'Events require start, end and venue');
 }
 return p;
}
export function validateLayout(page,l){if(page===HUB_LAYOUT_PAGE)return validateHubLayout(l);check(catalog.pages[page],404,'Unknown page');check(l&&l.schemaVersion===1&&l.pageKey===page&&Array.isArray(l.sections)&&l.sections.length<=40,422,'Invalid page layout');const ids=new Set();
 for(const s of l.sections){check(typeof s.id==='string'&&!ids.has(s.id),422,'Duplicate or missing widget ID');ids.add(s.id);check(catalog.pageWidgets[page].includes(s.type),422,'Widget not allowed on this page');check(typeof s.enabled==='boolean'&&Number.isInteger(s.order),422,'Invalid widget state');check(widgetValidators[s.type](s.props),422,ajv.errorsText(widgetValidators[s.type].errors));const p=s.layout;check(p&&['x','y','w','h'].every(k=>Number.isInteger(p[k]))&&p.x>=0&&p.y>=0&&p.w>=1&&p.h>=1&&p.x+p.w<=12&&p.h<=24&&p.y<=1000,422,'Widget is outside the 12-column grid')}
 return l;
}
export function validateProfile(p){check(p&&/^[a-z][a-z0-9-]{1,50}$/.test(p.id),422,'Invalid profile ID');check(typeof p.name==='string'&&p.name.length>1&&p.name.length<100&&profileTypes.includes(p.profileType),422,'Invalid profile');check(Array.isArray(p.allowedSections)&&p.allowedSections.length>0&&p.allowedSections.every(k=>k==='*'||catalog.pages[k]),422,'Select permitted pages');check(/^#[a-fA-F0-9]{6}$/.test(p.theme?.accent)&&['light','dark'].includes(p.theme?.mode)&&['en','ar'].includes(p.theme?.language),422,'Invalid theme');p.experience=validateExperience(p.experience,p);return p}
export const allowedPage=(p,k)=>p.allowedSections.includes('*')||p.allowedSections.includes(k);
export const activeAt=(p,now=Date.now())=>(!p.startAt||Date.parse(p.startAt)<=now)&&(!p.endAt||Date.parse(p.endAt)>now);
export function validateSchedule(p){check(p&&catalog.pages[p.pageKey]&&typeof p.name==='string'&&p.name.length>1,422,'Invalid schedule');check(Boolean(p.screenId)!==Boolean(p.groupName),422,'Choose exactly one screen or group');check(Array.isArray(p.daysOfWeek)&&p.daysOfWeek.length&&p.daysOfWeek.every(d=>Number.isInteger(d)&&d>=0&&d<=6),422,'Invalid weekdays');check(/^([01]\d|2[0-3]):[0-5]\d$/.test(p.startTime)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(p.endTime)&&p.startTime!==p.endTime,422,'Invalid time window');try{new Intl.DateTimeFormat('en',{timeZone:p.timeZone}).format()}catch{throw new Problem(422,'Invalid IANA timezone')};for(const k of ['validFrom','validTo'])if(p[k])check(/^\d{4}-\d{2}-\d{2}$/.test(p[k])&&Number.isFinite(Date.parse(p[k])),422,'Invalid validity date');check(!p.validFrom||!p.validTo||p.validFrom<=p.validTo,422,'Invalid validity range');check(Number.isInteger(p.priority)&&typeof p.enabled==='boolean',422,'Invalid priority or enabled state');return p}
export function scheduledPage(screen,profile,schedules,now=new Date()){
 const matches=schedules.filter(s=>{if(!s.enabled||!allowedPage(profile,s.pageKey)||(s.screenId?s.screenId!==screen.id:s.groupName!==screen.payload.groupName))return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:s.timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));let day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday);const t=parts.hour+':'+parts.minute;let date=parts.year+'-'+parts.month+'-'+parts.day;
 const overnight=s.startTime>s.endTime;if(overnight&&t<s.endTime){day=(day+6)%7;date=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10)}
 return s.daysOfWeek.includes(day)&&(!s.validFrom||date>=s.validFrom)&&(!s.validTo||date<=s.validTo)&&(overnight?(t>=s.startTime||t<s.endTime):(t>=s.startTime&&t<s.endTime));
 }).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 return matches[0]?.pageKey||(allowedPage(profile,screen.payload.assignedPage)?screen.payload.assignedPage:Object.keys(catalog.pages).find(k=>allowedPage(profile,k)));
}
