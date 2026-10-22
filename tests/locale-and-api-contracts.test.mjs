import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),dict=JSON.parse(readFileSync('lib/ui-en.json','utf8'));
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync('lib/ui-locale.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>n==='@/lib/ui-en.json'?{default:dict}:require(n),m,m.exports);
test('English UI catalog covers explicit literals and leaves original German and unknown content intact',()=>{
 assert.equal(m.exports.uiText('en','  Öffnungszeiten '),'  Opening hours ');
 assert.equal(m.exports.uiText('de','Öffnungszeiten'),'Öffnungszeiten');
 assert.equal(m.exports.uiText('en','A business or customer supplied this unique text'),'A business or customer supplied this unique text');
 const files=['app/page.tsx','app/admin/page.tsx','app/not-found.tsx',...readdirSync('components').filter(x=>x.endsWith('.tsx')).map(x=>'components/'+x)];let checked=0;
 for(const path of files){const source=readFileSync(path,'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='ui'&&ts.isStringLiteral(n.arguments[0])){assert.ok(Object.hasOwn(dict,n.arguments[0].text.trim()),path+': missing '+n.arguments[0].text);checked++}ts.forEachChild(n,visit)}visit(file);
  assert.doesNotMatch(source,/ui\((?:r\.body|p\.name|post\.body|selected\.name|s\.caption)\)/,'User content must not enter the automatic UI translator');
 }assert.ok(checked>1500);
});
test('Every literal API error and notice has an explicit UI translation',()=>{
 let count=0;function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory()){scan(path);continue}if(!path.endsWith('.ts'))continue;const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);function visit(n){if(ts.isPropertyAssignment(n)&&['error','notice'].includes(n.name.getText(file))&&ts.isStringLiteral(n.initializer)){assert.ok(Object.hasOwn(dict,n.initializer.text.trim()),path+': '+n.initializer.text);count++}ts.forEachChild(n,visit)}visit(file)}}scan('app/api');assert.ok(count>150);
});
test('API contracts cover every published route including OAuth callbacks, binary media and multipart upload',()=>{
 const spec=JSON.parse(readFileSync('docs/openapi.json','utf8')),inventory=readFileSync('docs/API_INVENTORY.md','utf8');
 const operations=[...inventory.matchAll(/\| (GET|POST|PATCH|DELETE|PUT) \| `([^`]+)`/g)];
 const ids=new Set();for(const [,method,route]of operations){const key=route.replace(/\[([^\]]+)\]/g,'{$1}'),op=spec.paths[key]?.[method.toLowerCase()];assert.ok(op,method+' '+route);assert.ok(op.responses);assert.ok(op['x-source']);assert.ok(!ids.has(op.operationId));ids.add(op.operationId)}
 assert.equal(ids.size,Object.values(spec.paths).reduce((n,p)=>n+Object.keys(p).length,0));
 assert.ok(spec.paths['/api/auth/oauth/{provider}/callback'].post.requestBody.content['application/x-www-form-urlencoded']);
 assert.ok(spec.paths['/api/media/upload'].post.requestBody.content['multipart/form-data']);
 assert.ok(spec.paths['/api/media/{id}'].get.responses['200'].content['video/mp4']);
 assert.ok(spec.paths['/api/billing/webhook'].post.parameters.some(p=>p.name==='Stripe-Signature'&&p.required));
 for(const [path,methods]of Object.entries(spec.paths))for(const [method,op]of Object.entries(methods))if(op.requestBody?.content?.['application/json'])assert.equal(op.requestBody.content['application/json'].schema['x-referenced-fields'],undefined,method+' '+path+' needs an explicit input contract');
 assert.ok(spec.paths['/api/deals'].post.requestBody.content['application/json'].schema.properties.premium_only);
});
