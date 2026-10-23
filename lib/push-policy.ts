/** Only known browser push services, never arbitrary URLs supplied by a client. */
export function safePushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&value.length<=2048&&
  (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false}
}
export function validPushKeys(keys:{p256dh:string;auth:string}){
 try{return /^[A-Za-z0-9_-]+$/.test(keys.p256dh)&&/^[A-Za-z0-9_-]+$/.test(keys.auth)&&Buffer.from(keys.p256dh,'base64url').length===65&&Buffer.from(keys.auth,'base64url').length===16}catch{return false}
}
export function pushConfigured(){
 const pub=process.env.WEB_PUSH_PUBLIC_KEY||'',priv=process.env.WEB_PUSH_PRIVATE_KEY||'',subject=process.env.WEB_PUSH_SUBJECT||'';
 return Buffer.from(pub,'base64url').length===65&&Buffer.from(priv,'base64url').length===32&&/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)&&Boolean(process.env.PUSH_WORKER_TOKEN?.length&&process.env.PUSH_WORKER_TOKEN.length>=32);
}
