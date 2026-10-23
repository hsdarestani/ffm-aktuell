/** Twilio Verify owns SMS codes; no OTP or provider credential enters app logs/storage. */
export function phoneConfigured(){return /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')&&Boolean(process.env.TWILIO_AUTH_TOKEN)&&/^VA[a-f0-9]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID||'')}
export function normalizePhone(raw:unknown){const v=typeof raw==='string'?raw.replace(/[ ()-]/g,''):'';return /^\+[1-9]\d{7,14}$/.test(v)?v:null}
export function phoneAllowed(phone:string){return (process.env.FFM_PHONE_PREFIXES||'+49').split(',').map(x=>x.trim()).filter(x=>/^\+[1-9]\d{0,3}$/.test(x)).some(p=>phone.startsWith(p))}
export async function verifyPhone(phone:string,code?:string,sid?:string){
 const service=process.env.TWILIO_VERIFY_SERVICE_SID;
 const body=code?new URLSearchParams({VerificationSid:sid||'',Code:code}):new URLSearchParams({To:phone,Channel:'sms',Locale:'de'});
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
 try{const res=await fetch('https://verify.twilio.com/v2/Services/'+service+(code?'/VerificationCheck':'/Verifications'),{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body,signal:ctl.signal});if(!res.ok)throw Error('Phone provider unavailable');const data=await res.json();if(data.to!==phone||!/^VE[a-f0-9]{32}$/i.test(data.sid||'')||(sid&&sid!==data.sid))throw Error('Phone identity mismatch');return {sid:data.sid as string,approved:data.status==='approved',pending:data.status==='pending'}}finally{clearTimeout(timer)}
}
