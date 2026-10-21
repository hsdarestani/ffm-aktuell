// One web server with a small scheduler; no extra database pool or paid push service.
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['server.js'],{stdio:'inherit',env:process.env});
let stopping=false,active=false;
const interval=setInterval(async()=>{
 if(stopping||active||!process.env.PUSH_WORKER_TOKEN||!process.env.WEB_PUSH_PRIVATE_KEY)return;
 active=true;
 try{const r=await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/internal/push-tick',{method:'POST',headers:{authorization:'Bearer '+process.env.PUSH_WORKER_TOKEN},signal:AbortSignal.timeout(120000)});if(!r.ok)console.error('Push scheduler request failed:',r.status)}
 catch{if(!stopping)console.error('Push scheduler temporarily unavailable')}
 finally{active=false}
},60000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;clearInterval(interval);server.kill(signal)});
server.on('exit',(code)=>{clearInterval(interval);process.exit(code??1)});
