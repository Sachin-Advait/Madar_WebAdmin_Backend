import {createErrorHandler,getDefaultFormState,toErrorSchema,unwrapErrorHandler,validationDataMerge} from '@rjsf/utils';
import type {CustomValidator,ErrorTransformer,RJSFSchema,RJSFValidationError,UiSchema,ValidationData,ValidatorType} from '@rjsf/utils';

/**
 * CSP-safe form validator for the admin's JSON-schema forms.
 *
 * `@rjsf/validator-ajv8` compiles schemas with `new Function`, which the API's
 * Content-Security-Policy (`script-src 'self'`) blocks, so every Save failed with
 * "Error compiling schema". The admin schemas only use a small keyword subset
 * (type, properties, required, enum, items, uniqueItems, minimum, maximum,
 * minLength, maxLength, pattern, additionalProperties), which this validator
 * interprets directly. The API still performs the authoritative validation.
 */
type Schema=RJSFSchema&Record<string,any>;
type Issue={name:string;property:string;message:string;params:Record<string,unknown>;stack:string;schemaPath:string;title?:string};

const typeOf=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':Number.isInteger(v)?'integer':typeof v;
function matchesType(v:unknown,t:string){const actual=typeOf(v);return t===actual||(t==='number'&&actual==='integer')}

function check(schema:Schema|undefined,data:unknown,path:string[],schemaPath:string,out:Issue[]){
 if(!schema||typeof schema!=='object'||data===undefined)return;
 const property=path.length?'.'+path.join('.'):'';
 const add=(name:string,message:string,params:Record<string,unknown>={},title=schema.title)=>out.push({name,property,message,params,stack:`${title?`'${title}' `:property?property+' ':''}${message}`.trim(),schemaPath:schemaPath+'/'+name,title});
 if(schema.type){const types=([] as string[]).concat(schema.type);if(!types.some(t=>matchesType(data,t))){add('type',`must be ${types.join(' or ')}`,{type:schema.type});return}}
 if(Array.isArray(schema.enum)&&!schema.enum.some((e:unknown)=>JSON.stringify(e)===JSON.stringify(data)))add('enum','must be equal to one of the allowed values',{allowedValues:schema.enum});
 if(typeof data==='string'){
  if(typeof schema.minLength==='number'&&[...data].length<schema.minLength)add('minLength',`must NOT have fewer than ${schema.minLength} characters`,{limit:schema.minLength});
  if(typeof schema.maxLength==='number'&&[...data].length>schema.maxLength)add('maxLength',`must NOT have more than ${schema.maxLength} characters`,{limit:schema.maxLength});
  if(typeof schema.pattern==='string'){try{if(!new RegExp(schema.pattern,'u').test(data))add('pattern',`must match pattern "${schema.pattern}"`,{pattern:schema.pattern})}catch{/* invalid pattern: leave to the API */}}
 }
 if(typeof data==='number'){
  if(typeof schema.minimum==='number'&&data<schema.minimum)add('minimum',`must be >= ${schema.minimum}`,{comparison:'>=',limit:schema.minimum});
  if(typeof schema.maximum==='number'&&data>schema.maximum)add('maximum',`must be <= ${schema.maximum}`,{comparison:'<=',limit:schema.maximum});
 }
 if(Array.isArray(data)){
  if(typeof schema.minItems==='number'&&data.length<schema.minItems)add('minItems',`must NOT have fewer than ${schema.minItems} items`,{limit:schema.minItems});
  if(typeof schema.maxItems==='number'&&data.length>schema.maxItems)add('maxItems',`must NOT have more than ${schema.maxItems} items`,{limit:schema.maxItems});
  if(schema.uniqueItems&&new Set(data.map(v=>JSON.stringify(v))).size!==data.length)add('uniqueItems','must NOT have duplicate items');
  if(schema.items&&!Array.isArray(schema.items))data.forEach((v,i)=>check(schema.items as Schema,v,[...path,String(i)],schemaPath+'/items',out));
 }
 if(data&&typeof data==='object'&&!Array.isArray(data)){
  const obj=data as Record<string,unknown>,props=(schema.properties||{}) as Record<string,Schema>;
  for(const key of (schema.required||[]) as string[])if(obj[key]===undefined||obj[key]===null||obj[key]===''){
   const title=props[key]?.title||key;out.push({name:'required',property:property+'.'+key,message:`must have required property '${title}'`,params:{missingProperty:key},stack:`must have required property '${title}'`,schemaPath:schemaPath+'/required',title});
  }
  for(const [key,value] of Object.entries(obj)){
   if(props[key])check(props[key],value,[...path,key],schemaPath+'/properties/'+key,out);
   else if(schema.additionalProperties===false&&value!==undefined)add('additionalProperties',`must NOT have additional property '${key}'`,{additionalProperty:key});
  }
 }
}

export function validateSchema(schema:Schema,data:unknown):Issue[]{const out:Issue[]=[];check(schema,data,[],'#',out);return out}

class CspSafeValidator implements ValidatorType<any,RJSFSchema,any>{
 validateFormData(formData:any,schema:RJSFSchema,customValidate?:CustomValidator<any,RJSFSchema,any>,transformErrors?:ErrorTransformer<any,RJSFSchema,any>,uiSchema?:UiSchema<any,RJSFSchema,any>):ValidationData<any>{
  let errors:RJSFValidationError[]=validateSchema(schema as Schema,formData);
  if(typeof transformErrors==='function')errors=transformErrors(errors,uiSchema);
  const errorSchema=toErrorSchema<any>(errors);
  if(typeof customValidate!=='function')return {errors,errorSchema};
  const data=getDefaultFormState(this,schema,formData,schema,true);
  const handler=customValidate(data,createErrorHandler(data),uiSchema,errorSchema);
  return validationDataMerge({errors,errorSchema},unwrapErrorHandler(handler));
 }
 isValid(schema:RJSFSchema,formData:any):boolean{return validateSchema(schema as Schema,formData).length===0}
 rawValidation<Result=any>(schema:RJSFSchema,formData?:any):{errors?:Result[];validationError?:Error}{return {errors:validateSchema(schema as Schema,formData) as unknown as Result[]}}
}

const validator=new CspSafeValidator();
export default validator;
