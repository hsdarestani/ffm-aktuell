'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Coffee,Martini,UtensilsCrossed,Compass,Sparkles} from 'lucide-react';
type Item={id:string;name:string;category:string;district:string;description_de?:string;description_en?:string;reasons?:string[];distance_km?:number|null};
const groups=[
 {value:'Cafés',de:'Cafés',en:'Cafés',icon:Coffee},
 {value:'Bars',de:'Bars',en:'Bars',icon:Martini},
 {value:'Restaurants',de:'Restaurants',en:'Restaurants',icon:UtensilsCrossed},
 {value:'Freizeit',de:'Aktivitäten',en:'Activities',icon:Compass}
];
export default function MatcherQuiz({lang,loggedIn,onLogin,onPlace,onDiscover}:{lang:'de'|'en';loggedIn:boolean;onLogin:()=>void;onPlace:(id:string)=>void;onDiscover:(category:string)=>void}){
 const [stage,setStage]=useState(0),[group,setGroup]=useState('Cafés'),[companion,setCompanion]=useState(''),
 [daypart,setDaypart]=useState(''),[budget,setBudget]=useState(''),[weather,setWeather]=useState(true),[ai,setAi]=useState(false),
 [busy,setBusy]=useState(false),[result,setResult]=useState<Item[]>([]),[asked,setAsked]=useState(false),[notice,setNotice]=useState('');
 const t=(de:string,en:string)=>lang==='de'?de:en;
 const choices=[
  [{value:'',label:t('Ganz egal','Any')},{value:'solo',label:t('Alleine','Solo')},{value:'partner',label:t('Zu zweit','With a partner')},{value:'friends',label:t('Mit Freunden','With friends')},{value:'family',label:t('Mit Familie','With family')}],
  [{value:'',label:t('Jederzeit','Any time')},{value:'morning',label:t('Vormittags','Morning')},{value:'afternoon',label:t('Nachmittags','Afternoon')},{value:'evening',label:t('Abends','Evening')},{value:'night',label:t('Nachts','Late night')}],
  [{value:'',label:t('Preis egal','Any budget')},{value:'1',label:'€'},{value:'2',label:'€€'},{value:'3',label:'€€€'},{value:'4',label:'€€€€'}]
 ];
 const values=[companion,daypart,budget],setters=[setCompanion,setDaypart,setBudget];
 async function match(){
  setBusy(true);setAsked(true);setNotice('');setResult([]);
  const q={Cafés:'Café Kaffee gemütlich',Bars:'Bar Drinks Cocktails',Restaurants:'Restaurant Essen',Freizeit:'Freizeit Aktivität erleben'}[group]||group;
  const params=new URLSearchParams({q,lang,category:group,companion,daypart,budget,weather:weather?'1':'0',ai:ai&&loggedIn?'1':'0'});
  try{const r=await fetch('/api/recommendations?'+params,{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error('Empfehlungsdienst nicht erreichbar.');
   setResult((d.items||[]).slice(0,3));setNotice(d.notice||'');
  }catch{setNotice(t('Vorschläge sind vorübergehend nicht verfügbar.','Suggestions are temporarily unavailable.'))}finally{setBusy(false)}
 }
 return <main className="ffm-matcher-screen">
  <header className="ffm-city-head"><span className="ffm-city-eyebrow">FINDE DEINEN SPOT</span><h1>Matcher<span>.</span></h1>
   <p>{t('Wähle aus, worauf du Lust hast. Wir zeigen passende Orte aus Frankfurt.','Answer a few quick questions to find the right spot.')}</p></header>
  <div className="ffm-matcher-content">
   <div className="ffm-matcher-progress"><span>{asked?t('Deine Vorschläge','Your matches'):t('Frage','Question')+' '+(stage+1)+'/4'}</span><div>{Array.from({length:4},(_,i)=><span key={i} className={i<=stage?'active':''}/>)}</div></div>
   {!asked?<>
    <h2>{stage===0?t('Was möchtest du machen?','What are you in the mood for?'):stage===1?t('Mit wem bist du unterwegs?','Who is joining?'):stage===2?t('Wann möchtest du los?','When do you want to go?'):t('Welches Preisniveau passt?','What is your budget?')}</h2>
    <div className={'ffm-matcher-choices '+(stage===0?'four':'')}>
     {stage===0?groups.map(g=><button key={g.value} onClick={()=>{setGroup(g.value);setStage(1)}} className={group===g.value?'active':''}><g.icon size={24}/><strong>{lang==='de'?g.de:g.en}</strong><ArrowRight size={16}/></button>):
      choices[stage-1].map(c=><button key={c.value||'any'} className={values[stage-1]===c.value?'active':''} onClick={()=>{setters[stage-1](c.value);if(stage<3)setStage(stage+1)}}><span>{c.label}</span>{values[stage-1]===c.value&&<CheckCircle2 size={18}/>}</button>)}
    </div>
    {stage===3&&<div className="ffm-matcher-extras">
     <label><input type="checkbox" checked={weather} onChange={e=>setWeather(e.target.checked)}/>{t('Wetter berücksichtigen','Consider weather')}</label>
     <label><input type="checkbox" checked={ai} onChange={e=>{if(e.target.checked&&!loggedIn){onLogin();return}setAi(e.target.checked)}}/>{t('Mit KI sortieren (Text wird an OpenAI übertragen)','AI ranking (text shared with OpenAI)')}</label>
    </div>}
    <div className="ffm-matcher-bottom"><button disabled={stage===0} onClick={()=>setStage(v=>Math.max(0,v-1))}><ArrowLeft size={17}/>{t('Zurück','Back')}</button>
     {stage===3?<button className="ffm-matcher-main" disabled={busy} onClick={()=>void match()}><Sparkles size={17}/>{t('Meine Matches finden','Find my matches')}</button>:
      <button className="ffm-matcher-main" onClick={()=>setStage(v=>Math.min(3,v+1))}>{t('Weiter','Next')}<ArrowRight size={17}/></button>}
    </div>
   </>:<div className="ffm-matcher-results"><h2>{t('Deine Matches','Your matches')}</h2>
    {busy?<p role="status">{t('Passende Orte werden gesucht …','Finding matches …')}</p>:
     result.length>0?<div>{result.map((p,i)=><button key={p.id} onClick={()=>onPlace(p.id)}>
      <small>0{i+1} · {p.category} · {p.district||'Frankfurt'}</small><strong>{p.name}</strong>
      <span>{lang==='en'?p.description_en||p.description_de:p.description_de||p.description_en}</span><span className="ffm-matcher-see">{t('Ort ansehen','View place')} ↗</span>
      </button>)}</div>:<div className="ffm-city-empty"><Sparkles size={27}/><strong>{t('Noch keine passenden verifizierten Orte.','No independently verified matches yet.')}</strong>
      <p>{t('Wir zeigen keine erfundenen Empfehlungen. Du kannst weitere, deutlich als ungeprüft gekennzeichnete Orte durchsuchen.','We never invent recommendations. Browse other clearly marked unverified places instead.')}</p>
      <button onClick={()=>onDiscover(group)}>{t('Weitere Orte entdecken','Explore more places')}</button></div>}
    {notice&&<p className="ffm-city-disclaimer">{notice}</p>}
    <div className="ffm-matcher-bottom"><button onClick={()=>{setAsked(false);setStage(0);setResult([])}}>{t('Noch einmal','Start over')}</button><button onClick={()=>onDiscover(group)}>{t('Alle Orte anzeigen','See all places')}</button></div>
   </div>}
  </div>
 </main>;
}
