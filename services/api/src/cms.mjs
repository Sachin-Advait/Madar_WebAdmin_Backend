import Ajv from 'ajv';
import {z} from 'zod';
import {catalog,check,activeAt,allowedPage} from './domain.mjs';
import {rows,one} from './db.mjs';

const text=(title,maxLength=200)=>({type:'string',title,maxLength});
const common={name:{...text('Name'),minLength:1},nameAr:text('Arabic name'),active:{type:'boolean',title:'Active',default:true},sortOrder:{type:'integer',default:0},description:text('Description',2000)};
export const masterSchemas={
 buildings:{title:'Buildings',properties:{...common,address:text('Address',500)}},
 groups:{title:'Device groups',properties:{...common,purpose:text('Purpose',500)}},
 languages:{title:'Languages',properties:{...common,code:{type:'string',pattern:'^[a-z]{2}(-[A-Z]{2})?$'},direction:{type:'string',enum:['ltr','rtl'],default:'ltr'}}},
 providers:{title:'Media providers',properties:{...common,referencePrefix:text('Server-side reference prefix'),protocol:{type:'string',enum:['HLS','DASH','MP4','MP3']},supportContact:text('Support contact')}},
 categories:{title:'Categories',properties:{...common,resourceKind:{type:'string',title:'Content section',enum:Object.keys(catalog.resources)}}},
 locations:{title:'Locations',properties:{...common,building:text('Building'),floor:text('Floor'),directions:text('Directions',1000),accessibility:text('Accessibility',1000)}},
 departments:{title:'Departments',properties:{...common,contact:text('Contact'),hours:text('Hours')}},
 rooms:{title:'Meeting rooms',properties:{...common,locationId:text('Location ID'),capacity:{type:'integer',minimum:1,maximum:2000},status:{type:'string',enum:['available','occupied','unavailable'],default:'available'}}},
 counters:{title:'Service counters',properties:{...common,locationId:text('Location ID'),service:text('Service'),status:{type:'string',enum:['available','serving','paused','closed'],default:'available'}}}
};
for(const s of Object.values(masterSchemas))Object.assign(s,{type:'object',required:['name','active'],additionalProperties:false});
masterSchemas.languages.required.push('code','direction');
const field=z.object({key:z.string().regex(/^[a-z][a-zA-Z0-9_]{1,39}$/).refine(k=>!['constructor','prototype','__proto__'].includes(k)),label:z.string().min(1).max(80),labelAr:z.string().max(80).default(''),type:z.enum(['text','longtext','number','boolean','date','url','select']),required:z.boolean().default(false),showOnTv:z.boolean().default(true),options:z.array(z.string().min(1).max(100)).max(50).default([])}).strict();
export function parseFields(value){const fields=z.array(field).max(24).parse(value);check(new Set(fields.map(f=>f.key)).size===fields.length,422,'Field keys must be unique');for(const f of fields)if(f.type==='select')check(f.options.length>0&&new Set(f.options).size===f.options.length,422,'Select fields need unique choices');return fields}
export function extendedSchema(kind,fields=[]){
 check(catalog.resourceSchemas[kind],404,'Unknown content section');const schema=structuredClone(catalog.resourceSchemas[kind]);
 const properties=Object.fromEntries(fields.map(f=>[f.key,{title:f.label,...(f.type==='number'?{type:'number'}:f.type==='boolean'?{type:'boolean'}:{type:'string',maxLength:f.type==='longtext'?5000:500}),...(f.type==='select'?{enum:f.options}:{}),...(f.required&&['text','longtext','date','url'].includes(f.type)?{minLength:1}:{})}]));
 schema.properties.customFields={type:'object',title:'Additional information',properties,required:fields.filter(f=>f.required).map(f=>f.key),additionalProperties:false};
 if(fields.some(f=>f.required))schema.required=[...new Set([...(schema.required||[]),'customFields'])];return schema;
}
export async function contentFields(db,kind){return (await one(db,'SELECT fields FROM content_types WHERE kind=$1',[kind]))?.fields||[]}
export async function dynamicCatalog(db){const definitions=await rows(db,'SELECT * FROM content_types ORDER BY kind');return {...catalog,masterSchemas,fieldDefinitions:Object.fromEntries(Object.keys(catalog.resources).map(kind=>[kind,definitions.find(r=>r.kind===kind)||{kind,fields:[],revision:0}])),resourceSchemas:Object.fromEntries(Object.keys(catalog.resources).map(kind=>[kind,extendedSchema(kind,definitions.find(r=>r.kind===kind)?.fields)]))}}
export function validateExtra(fields,p){for(const f of fields){const v=p.customFields?.[f.key];if(v===undefined||v==='')continue;if(f.type==='url')check(/^https:\/\//i.test(v),422,f.label+' must be an HTTPS URL');if(f.type==='date')check(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v)),422,f.label+' must be a date');}}
const ajv=new Ajv({strict:false,allErrors:true});
export function validateMaster(kind,p){check(masterSchemas[kind],404,'Unknown master list');const validate=ajv.compile(masterSchemas[kind]);check(validate(p),422,ajv.errorsText(validate.errors));return p}
export const contentPage={channels:'live-tv',videos:'videos',radio:'radio',replay:'replay',notices:'info-notices',events:'info-events',services:'info-services',visitor:'info-visitor',media:'info-media',alerts:'info-alerts',programmes:'live-tv',meetings:'info-meetings',queueTickets:'info-queue',featured:'home'};
export async function visibleItem(db,screen,kind,id){const rel=await one(db,'SELECT bundle FROM releases WHERE id=$1',[screen.desired_release]);const p=rel?.bundle.profile;if(!p||!allowedPage(p,contentPage[kind]))return null;return rel.bundle.content[kind]?.find(r=>r.id===id&&activeAt(r))||null}
export async function listFavourites(db,screen){const saved=await rows(db,'SELECT kind,resource_id,created_at FROM favourites WHERE screen_id=$1 ORDER BY created_at DESC LIMIT 200',[screen.id]);const rel=await one(db,'SELECT bundle FROM releases WHERE id=$1',[screen.desired_release]);if(!rel)return [];return saved.flatMap(f=>{const r=rel.bundle.content[f.kind]?.find(r=>r.id===f.resource_id&&activeAt(r));return r&&allowedPage(rel.bundle.profile,contentPage[f.kind])?[{kind:f.kind,id:f.resource_id,createdAt:f.created_at,item:r}]:[]})}
