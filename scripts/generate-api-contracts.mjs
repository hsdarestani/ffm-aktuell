import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';
import {imperativeInputs} from './api-contract-overrides.mjs';
async function walk(dir){const a=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())a.push(...await walk(p));else if(e.name==='route.ts')a.push(p)}return a}
function validation(node,file){
 if(ts.isIdentifier(node)){if(node.text==='id')return {type:'string',format:'uuid'};if(node.text==='email')return {type:'string',format:'email'};return {'x-validator':node.getText(file)}}
 if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['text','optionalText'].includes(node.expression.text)){return {type:'string',...(node.expression.text==='text'?{minLength:1}:{}),...(node.arguments[0]&&ts.isNumericLiteral(node.arguments[0])?{maxLength:Number(node.arguments[0].text)}:{}),...(node.expression.text==='optionalText'?{'x-optional':true}:{})}}
 if(!ts.isCallExpression(node)||!ts.isPropertyAccessExpression(node.expression))return {'x-validator':node.getText(file)};
 const name=node.expression.name.text,base=node.expression.expression,args=node.arguments;
 if(ts.isIdentifier(base)&&base.text==='z'){
  if(name==='object'&&args[0]&&ts.isObjectLiteralExpression(args[0])){const properties={},required=[];for(const field of args[0].properties){if(!ts.isPropertyAssignment(field))continue;const key=field.name.getText(file).replace(/^['"]|['"]$/g,'');const schema=validation(field.initializer,file);properties[key]=schema;const code=field.initializer.getText(file);if(!schema['x-optional']&&!/\.(optional|nullish|default)\(/.test(code))required.push(key)}return {type:'object',properties,...(required.length?{required}:{})}}
  if(['string','number','boolean'].includes(name))return {type:name};
  if(name==='uuid'||name==='email'||name==='url')return {type:'string',format:name==='url'?'uri':name};
  if(name==='enum'&&args[0]&&ts.isArrayLiteralExpression(args[0]))return {type:'string',enum:args[0].elements.filter(ts.isStringLiteral).map(e=>e.text)};
  if(name==='literal'&&args[0]&&(ts.isStringLiteral(args[0])||ts.isNumericLiteral(args[0])))return {const:ts.isNumericLiteral(args[0])?Number(args[0].text):args[0].text};
  if(name==='array')return {type:'array',items:args[0]?validation(args[0],file):{}};
  if(name==='union'&&ts.isArrayLiteralExpression(args[0]))return {anyOf:args[0].elements.map(e=>validation(e,file))};
 }
 if(ts.isIdentifier(node.expression.expression)&&['text','optionalText'].includes(node.expression.name.text))return {'x-validator':node.getText(file)};
 let schema=validation(base,file),n=args[0]&&ts.isNumericLiteral(args[0])?Number(args[0].text):undefined;
 if(name==='int')schema.type='integer';
 if(n!==undefined&&['min','max','length'].includes(name)){const suffix=schema.type==='array'?'Items':schema.type==='string'?'Length':undefined;if(suffix)schema[(name==='max'?'max':'min')+suffix]=n;else schema[name==='max'?'maximum':'minimum']=n;if(name==='length'&&suffix)schema['max'+suffix]=n}
 if(name==='positive')schema.exclusiveMinimum=0;if(name==='nonnegative')schema.minimum=0;
 if(name==='optional'||name==='default')schema['x-optional']=true;
 if(name==='nullable'||name==='nullish')schema={anyOf:[schema,{type:'null'}],...(name==='nullish'?{'x-optional':true}:{})};
 if(name==='regex'||name==='refine'||name==='transform')schema['x-validation-expression']=node.getText(file);
 return schema;
}
const operations=[];
for(const path of await walk('app/api')){
 const source=await readFile(path,'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 const add=(method,url,body)=>operations.push({method,url,path,body,file});
 if(path.includes('[[...path]]')){const branches=[...source.matchAll(/if\(method==='(GET|POST|PATCH|DELETE|PUT)'&&path==='([^']+)'\)/g)];for(let i=0;i<branches.length;i++){const m=branches[i];add(m[1],'/api/'+m[2],source.slice(m.index,branches[i+1]?.index??source.length))}}
 else for(const n of file.statements){
  const url='/'+path.replace(/^app\//,'').replace(/\/route.ts$/,'');
  if(ts.isFunctionDeclaration(n)&&n.name&&/^(GET|POST|PATCH|DELETE|PUT)$/.test(n.name.text)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))add(n.name.text,url,n.getText(file));
  if(ts.isVariableStatement(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))for(const d of n.declarationList.declarations)if(/^(GET|POST|PATCH|DELETE|PUT)$/.test(d.name.getText(file))){const target=ts.isIdentifier(d.initializer)?file.statements.find(f=>ts.isFunctionDeclaration(f)&&f.name?.text===d.initializer.text):undefined;add(d.name.getText(file),url,target?.getText(file)||d.getText(file))}
 }
}
operations.sort((a,b)=>a.url.localeCompare(b.url)||a.method.localeCompare(b.method));
const paths={},manual=[],details=[];
for(const op of operations){
 const fragment=ts.createSourceFile(op.path,op.body,ts.ScriptTarget.Latest,true),schemas=[];
 function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.getText(fragment)==='z.object')schemas.push(validation(n,fragment));else ts.forEachChild(n,visit)}visit(fragment);
 if(!schemas.length){for(const statement of op.file.statements)if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(d.initializer&&op.body.includes(d.name.getText(op.file)+'.safeParse(')&&ts.isCallExpression(d.initializer)){const schema=validation(d.initializer,op.file);if(schema.type==='object')schemas.push(schema)}}
 const queries=[...new Set([...op.body.matchAll(/(?:qs|searchParams)\.get\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]))];
 const auth=op.url.includes('/admin/')&&!op.url.endsWith('/activate')?'department':/need\(user\)|if\(!u\)|if\(!actor\)/.test(op.body)?'session':op.url.includes('/internal/')?'worker':'public or conditional';
 const checks=op.body.split('\n').filter(l=>/need\(|admin\(|sessionUser\(|canAdmin\(|trustedOrigin\(|RecentlyAuthenticated|return .*?(?:403|401|402|409)|throw .*?status:/.test(l)).map(l=>l.trim()).join('\n');
 const guards=op.body.split('\n').filter(l=>/safeParse|parse\(|Invalid|ungültig|ungültige|typeof |\.includes\(|\.test\(|return bad\(/i.test(l)&&!l.includes('SELECT ')).map(l=>l.trim()).join('\n');
 const outputs=[...op.body.matchAll(/(?:return |const (?:res|response)=)(?:NextResponse\.json|reply|ok|bad|fail)\(([^;\n]+)\)/g)].map(m=>m[0].trim());
 const statuses=[...new Set(['400',...op.body.matchAll(/(?:status:|,)([1-5][0-9]{2})\b/g)].map(x=>typeof x==='string'?x:x[1]))];
 const hasBody=/await (?:req|request)\.json\(|payload\(req\)/.test(op.body);
 const refs=[...new Set([...op.body.matchAll(/\b(?:b|d|data|input)\??\.([a-z][a-z0-9_]*)/g)].map(m=>m[1]))];
 const pathParams=[...op.url.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1]);
 const url=op.url.replace(/\[([^\]]+)\]/g,'{$1}'),id=op.method.toLowerCase()+'_'+op.url.replace(/[^a-z0-9]+/gi,'_');
 const operation={operationId:id,summary:op.method+' '+op.url,description:'Source: '+op.path+'. '+(auth==='department'?'A current department permission is required. ':auth==='session'?'A valid session is required. ':'')+'Exact conditional authorization and validation are documented in API_CONTRACTS.md.',tags:[op.url.split('/')[2]||'application'],parameters:[...pathParams.map(name=>({name,in:'path',required:true,schema:{type:'string'}})),...queries.map(name=>({name,in:'query',schema:{type:'string'},description:'Raw URL value. Requiredness and further validation follow the source expressions in x-query-validation.'}))],responses:{'200':{description:'Successful response, unless a more specific successful status is returned. See x-response-expressions.',content:{'application/json':{schema:{}}}},...Object.fromEntries(statuses.map(s=>[s,{description:Number(s)<300?'Successful response':'Request rejected; inspect the returned error and handler validation.',content:{'application/json':{schema:Number(s)<300?{}:{$ref:'#/components/schemas/Error'}}}}]))},'x-source':op.path,'x-authorization':checks,'x-query-validation':guards,'x-response-expressions':outputs};
 if(auth==='department'||auth==='session')operation.security=[{cookieSession:[]}];else if(auth==='worker')operation.security=[{workerAuthorization:[]}];else operation.security=[{}, {cookieSession:[]}];
 if(hasBody){const schema=imperativeInputs[op.method+' '+op.url]|| (schemas.length===1?schemas[0]:schemas.length?{anyOf:schemas}:{type:'object','x-referenced-fields':refs,'x-validation-expressions':guards});operation.requestBody={required:true,content:{'application/json':{schema}}};if(!schemas.length)manual.push(op.method+' '+op.url)}
 if(op.url.includes('/auth/oauth/')&&!op.url.endsWith('/status')){
  operation.parameters=operation.parameters.map(p=>p.name==='provider'?{...p,schema:{type:'string',enum:['google','apple']}}:p);
  operation.responses={'307':{description:'Redirect to the provider or the configured site after verified login or a safe failure.',headers:{Location:{schema:{type:'string',format:'uri-reference'}}}},'404':{description:'Unknown provider'}};
  operation.security=[];
  if(op.url.endsWith('/callback')){const fields={state:{type:'string'},code:{type:'string'}};if(op.method==='POST')operation.requestBody={required:true,content:{'application/x-www-form-urlencoded':{schema:{type:'object',properties:fields,required:['state','code']}}}};else operation.parameters.push(...Object.entries(fields).map(([name,schema])=>({name,in:'query',required:true,schema})));}
 }
 if(op.url==='/api/media/upload')operation.requestBody={required:true,content:{'multipart/form-data':{schema:{type:'object',properties:{file:{type:'string',format:'binary',description:'JPEG, PNG, WebP, MP4 or WebM; at most 24 MiB. Active private scanning and subsequent editorial approval required.'},license_confirmed:{const:'true',type:'string'}},required:['file','license_confirmed']}}}};
 if(op.url==='/api/media/[id]'){operation.responses['200']={description:'Approved and currently authorized media bytes, or private owner/moderator preview.',content:Object.fromEntries(['image/jpeg','image/png','image/webp','video/mp4','video/webm'].map(t=>[t,{schema:{type:'string',format:'binary'}}]))};operation.responses['206']={description:'Bounded video byte range'};operation.responses['416']={description:'Invalid range'};operation.parameters.push({name:'Range',in:'header',schema:{type:'string'}})}
 if(op.url==='/api/billing/webhook'){operation.security=[];operation.parameters.push({name:'Stripe-Signature',in:'header',required:true,schema:{type:'string'}});operation.requestBody={required:true,description:'Exact signed Stripe event bytes. Re-serialization invalidates the signature.',content:{'application/json':{schema:{type:'object',properties:{id:{type:'string'},type:{type:'string'},data:{type:'object'}},required:['id','type','data']}}}}
 }
 paths[url]??={};paths[url][op.method.toLowerCase()]=operation;
 const sections=['### '+op.method+' `'+op.url+'`','Handler: ['+op.path+'](../'+op.path+'). Access: **'+auth+'**.'];
 if(queries.length)sections.push('Query names: '+queries.map(q=>'`'+q+'`').join(', ')+'.');
 if(operation.requestBody)sections.push('Request body contract:\n\n```json\n'+JSON.stringify(operation.requestBody,null,2)+'\n```');
 if(checks)sections.push('Authorization and state gates:\n\n```ts\n'+checks+'\n```');
 if(guards)sections.push('Validation expressions:\n\n```ts\n'+guards+'\n```');
 sections.push('Responses:\n\n```ts\n'+(outputs.join('\n')||'See the handler for non-JSON, redirect, media or shared-helper responses.')+'\n```');
 details.push(sections.join('\n\n')+'\n');
}
const spec={openapi:'3.1.0',info:{title:'FFM Aktuell web API',version:'2026-10-22',description:'Same-origin web API. Source-derived structural schemas and exact validation/authorization expressions are supplied together. Some action-based endpoints use imperative validation rather than Zod: their x-validation-expressions are authoritative; an unconstrained schema must not be read as unrestricted permission. The backend always enforces current ownership, consent and entitlements.'},servers:[{url:'/'}],components:{securitySchemes:{cookieSession:{type:'apiKey',in:'cookie',name:'ffm_session',description:'Opaque HttpOnly session cookie set by password, OAuth or restricted phone login. Never copy credentials into API documentation.'},workerAuthorization:{type:'http',scheme:'bearer',description:'Private internal worker token, never exposed to browsers.'}},schemas:{Error:{type:'object',properties:{error:{type:'string'}},required:['error']}}},paths};
await mkdir('docs',{recursive:true});await writeFile('docs/openapi.json',JSON.stringify(spec,null,2)+'\n');
await writeFile('docs/API_CONTRACTS.md','# FFM Aktuell API contracts\n\nGenerated from current executable route branches. Read with [OpenAPI](openapi.json), [A–I end-to-end flows](ACCEPTANCE_A_TO_I.md) and [technical handover](TECHNICAL_HANDOVER.md).\n\n## Common contract\n\nUse same-origin HTTPS with the HttpOnly `ffm_session` cookie. State-changing browser calls are checked against the configured application origin. Never put session/worker/provider secrets in a query string. Authentication, branch ownership, department grants, recent authentication, consent, paid status and current content state are independent checks. Authorization can change between requests. JSON errors normally contain `error`; non-JSON media, calendar and redirect responses follow their handler. Dates, money, rights and source facts are not guessed. Pricing snapshots use integer euro cents; Berlin calendar-day and timezone rules apply where documented. Client redirects never activate benefits.\n\nThe OpenAPI structural types are not a substitute for imperative action validation. Every operation below includes the actual authorization, validation and response expressions, including action-specific paths. SQL-enforced row ownership, atomicity and state constraints remain authoritative. These expressions describe implementation and are never executed by the documentation page. Request/response examples for the main workflows are in the A–I acceptance document.\n\n'+details.join('\n'));
console.log('Documented',operations.length,'operations;',manual.length,'imperative body validators with exact expressions');
