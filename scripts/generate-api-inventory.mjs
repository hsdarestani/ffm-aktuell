// Source inventory, not a substitute for request/response contract tests.
import {readFile,readdir,writeFile} from 'node:fs/promises';
async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory())out.push(...await walk(path));else if(item.name==='route.ts')out.push(path)}return out}
const rows=[];
for(const path of await walk('app/api')){
 const source=await readFile(path,'utf8');const url='/'+path.replace(/^app\//,'').replace(/\/route.ts$/,'');
 if(path.includes('[[...path]]')){
  for(const m of source.matchAll(/method==='(GET|POST|DELETE|PATCH|PUT)'&&path==='([^']+)'/g))rows.push([m[1],'/api/'+m[2],path]);
 }else{
  for(const m of source.matchAll(/export (?:(?:async )?function (GET|POST|DELETE|PATCH|PUT)\(|const (GET|POST|DELETE|PATCH|PUT)\s*=)/g))rows.push([m[1]||m[2],url,path]);
 }
}
rows.sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0]));
await writeFile('docs/API_INVENTORY.md','# API source inventory\n\nGenerated from the actual route handlers. Dynamic segments retain square brackets. This lists literal branches and exports, paired with [detailed contracts](API_CONTRACTS.md) and [OpenAPI](openapi.json). Refer to authorization checks in each handler and behavioral tests for its contract. All URLs are relative to the application origin.\n\n| Method | Route | Handler |\n| --- | --- | --- |\n'+rows.map(([method,url,path])=>'| '+method+' | `'+url+'` | ['+path+'](../'+path+') |').join('\n')+'\n');
console.log('Generated API inventory:',rows.length,'literal handlers');
