/**
 * Optional transactional mail, fail closed when not configured.
 * App never claims to deliver mail unless provider acknowledges the request.
 */
export const deliveryConfigured=()=>Boolean(process.env.RESEND_API_KEY&&process.env.FFM_EMAIL_FROM);
export async function sendTransactionalMail(to:string,subject:string,body:string){
 if(!deliveryConfigured())throw Object.assign(new Error('Mailversand noch nicht konfiguriert'),{status:503});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const result=await fetch('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({from:process.env.FFM_EMAIL_FROM,to:[to],subject,text:body}),signal:controller.signal
  });
  if(!result.ok)throw Error('E-Mail Anbieter hat die Nachricht nicht angenommen');
  const data=await result.json();
  if(typeof data?.id!=='string')throw Error('Versandbestätigung fehlt');
  return data.id as string;
 }finally{clearTimeout(timeout)}
}
