import {randomUUID,createHash} from 'node:crypto';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
export const ROOT=process.env.FFM_MEDIA_DIR||'/app/uploads';
export const MAX=24*1024*1024;
export const TYPES=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];
export function validSignature(t:string,b:Buffer){
 if(t==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(t==='image/png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(t==='image/webp')return b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(t==='video/mp4')return b.toString('ascii',4,8)==='ftyp';
 if(t==='video/webm')return b.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 return false;
}
export async function scannerReady():Promise<boolean>{
 const host=process.env.CLAMD_HOST;if(!host)return false;
 return new Promise(resolve=>{
  const socket=connect({host,port:Number(process.env.CLAMD_PORT||3310)});
  let done=false;
  const finish=(ok:boolean)=>{if(done)return;done=true;socket.destroy();resolve(ok)};
  socket.setTimeout(2500,()=>finish(false));
  socket.once('error',()=>finish(false));
  socket.once('connect',()=>socket.write(Buffer.from('zPING\\0')));
  socket.on('data',chunk=>finish(chunk.toString('utf8').includes('PONG')));
  socket.once('close',()=>finish(false));
 });
}
export function scan(bytes:Buffer):Promise<void>{
 const host=process.env.CLAMD_HOST;if(!host)return Promise.reject(Error('Virenscanner nicht eingerichtet'));
 return new Promise((resolve,reject)=>{
  const s=connect({host,port:Number(process.env.CLAMD_PORT||3310)});
  let finished=false,answer='';
  const done=(err?:Error)=>{if(finished)return;finished=true;s.destroy();err?reject(err):resolve();};
  s.setTimeout(15000,()=>done(Error('Virenscanner nicht erreichbar')));s.once('error',done);
  s.on('connect',()=>{
   s.write(Buffer.from('zINSTREAM\0'));
   for(let pos=0;pos<bytes.length;pos+=65536){const b=bytes.subarray(pos,pos+65536),header=Buffer.alloc(4);header.writeUInt32BE(b.length);s.write(header);s.write(b);}
   s.write(Buffer.alloc(4));
  });
  s.on('data',b=>{answer+=b.toString();if(answer.includes('FOUND')||answer.includes('ERROR'))done(Error('Sicherheitsprüfung fehlgeschlagen'));else if(answer.includes('OK'))done();});
  s.on('close',()=>{if(!finished)done(Error('Keine Scanner Antwort'))});
 });
}
async function remux(bytes:Buffer,t:string):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  const args=['-hide_banner','-loglevel','error','-i','pipe:0','-map','0:v:0','-map','0:a?','-map_metadata','-1','-map_chapters','-1','-c','copy'];
  if(t==='video/mp4')args.push('-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1');else args.push('-f','webm','pipe:1');
  const proc=spawn('ffmpeg',args,{stdio:['pipe','pipe','ignore']});let size=0;const chunks:Buffer[]=[];
  const timer=setTimeout(()=>proc.kill('SIGKILL'),25000);
  proc.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>MAX)proc.kill('SIGKILL');else chunks.push(b);});
  proc.on('error',e=>{clearTimeout(timer);reject(e)});
  proc.on('close',code=>{clearTimeout(timer);if(code!==0||size===0||size>MAX)reject(Error('Videoverarbeitung fehlgeschlagen'));else resolve(Buffer.concat(chunks))});
  proc.stdin.on('error',()=>{});proc.stdin.end(bytes);
 });
}
export async function processMedia(bytes:Buffer,mime:string){
 if(!TYPES.includes(mime)||bytes.length<16||bytes.length>MAX||!validSignature(mime,bytes))throw Error('Dateityp oder Größe nicht erlaubt');
 await scan(bytes);
 const result=mime.startsWith('image/')?await sharp(bytes,{failOn:'error',limitInputPixels:30000000}).rotate().resize(2000,2000,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer():await remux(bytes,mime);
 const type=mime.startsWith('image/')?'image/webp':mime;
 if(result.length>MAX||!validSignature(type,result))throw Error('Medienverarbeitung fehlgeschlagen');
 await scan(result);
 return {bytes:result,mime:type,hash:createHash('sha256').update(result).digest('hex')};
}
export async function save(bytes:Buffer){const key=randomUUID();await mkdir(ROOT,{recursive:true});await writeFile(join(ROOT,key),bytes,{flag:'wx',mode:0o600});return key}
export async function load(key:string){if(!/^[0-9a-f-]{36}$/.test(key))throw Error('Bad key');return readFile(join(ROOT,key))}
export async function remove(key:string){if(/^[0-9a-f-]{36}$/.test(key))await unlink(join(ROOT,key)).catch(()=>{})}
