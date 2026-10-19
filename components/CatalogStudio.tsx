'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Category={slug:string;label_de:string;label_en:string;parent_slug:string|null;active:boolean};
type Place={id:string;name:string;category:string;status:string;categories:string[]};
async function request(url:string,body?:unknown){
 const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Anfrage fehlgeschlagen');return data;
}
export default function CatalogStudio({onNotice}:{onNotice:(message:string,success:boolean)=>void}){
 const [categories,setCategories]=useState<Category[]>([]),[places,setPlaces]=useState<Place[]>([]);
 const [search,setSearch]=useState(''),[busy,setBusy]=useState(false),[chosen,setChosen]=useState('');
 const [slug,setSlug]=useState(''),[de,setDe]=useState(''),[en,setEn]=useState(''),[parent,setParent]=useState('');
 const [tags,setTags]=useState<string[]>([]),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  try{const d=await request('/api/categories?include_inactive=1');setCategories(d.items||[]);}
  catch(e){onNotice(e instanceof Error?e.message:'Kategorien nicht verfügbar',false)}finally{setLoading(false)}
 },[onNotice]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{let active=true;const timer=setTimeout(()=>{
  request('/api/categories/places?'+new URLSearchParams({q:search})).then(d=>{if(active)setPlaces(d.items||[])}).catch(()=>{if(active)setPlaces([])});
 },250);return()=>{active=false;clearTimeout(timer)}},[search]);
 const selected=places.find(p=>p.id===chosen);
 const select=(id:string)=>{setChosen(id);const place=places.find(p=>p.id===id);setTags(place?.categories?.length?place.categories:[place?.category||''].filter(Boolean))};
 const edit=(c:Category)=>{setSlug(c.slug);setDe(c.label_de);setEn(c.label_en);setParent(c.parent_slug||'')};
 const send=async(body:object,path='/api/categories')=>{setBusy(true);try{await request(path,body);onNotice('Gespeichert. Änderungen werden sofort für die Kategorienauswahl verwendet.',true);await load();if(path.endsWith('places')){const d=await request('/api/categories/places?'+new URLSearchParams({q:search}));setPlaces(d.items||[]);}}catch(e){onNotice(e instanceof Error?e.message:'Speichern fehlgeschlagen',false)}finally{setBusy(false)}};
 const save=(e:FormEvent)=>{e.preventDefault();void send({action:'save',slug:slug.trim(),label_de:de.trim(),label_en:en.trim(),parent_slug:parent||null})};
 return <div className="ffm-catalog-studio">
  <div className="ffm-studio-page-heading"><div><h1>Kategorien<span>.</span></h1><p>Rubriken pflegen und mehrere passende Themen pro Ort vergeben.</p></div></div>
  <div className="ffm-catalog-grid">
   <section className="ffm-catalog-panel">
    <h2>Rubriken verwalten</h2>
    <p>Nur redaktionell bestätigte Kategorien erscheinen öffentlich. Unterkategorien lassen sich einer Hauptkategorie zuordnen.</p>
    <form onSubmit={save} className="ffm-catalog-form">
     <label>Kürzel oder ID<input required maxLength={70} value={slug} onChange={e=>setSlug(e.target.value)} placeholder="z. B. Familienaktivitäten"/></label>
     <label>Deutsch<input required value={de} maxLength={100} onChange={e=>setDe(e.target.value)}/></label>
     <label>Englisch<input required value={en} maxLength={100} onChange={e=>setEn(e.target.value)}/></label>
     <label>Unterkategorie von<select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Hauptkategorie</option>{categories.filter(c=>c.active&&!c.parent_slug&&c.slug!==slug).map(c=><option value={c.slug} key={c.slug}>{c.label_de}</option>)}</select></label>
     <div className="ffm-catalog-buttons"><button type="submit" disabled={busy}>Speichern</button><button type="button" className="secondary" onClick={()=>{setSlug('');setDe('');setEn('');setParent('')}}>Neue Kategorie</button></div>
    </form>
    <div className="ffm-catalog-items" aria-busy={loading}>{categories.map(c=><div key={c.slug} className={c.active?'':'inactive'}>
      <button type="button" onClick={()=>edit(c)}><strong>{c.parent_slug?'↳ ':''}{c.label_de}</strong><small>{c.label_en} · {c.slug}</small></button>
      <button type="button" disabled={busy} aria-label={c.active?'Deaktivieren':'Aktivieren'} onClick={()=>void send({action:'status',slug:c.slug,active:!c.active})}>{c.active?'Aktiv':'Inaktiv'}</button>
    </div>)}</div>
   </section>
   <section className="ffm-catalog-panel">
    <h2>Themen eines Ortes</h2>
    <p>Mehrere Kategorien wählen. Der erste Eintrag ist die Hauptrubrik. Die Betriebsprüfung wird dadurch nicht vorgetäuscht.</p>
    <label>Ort finden<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setChosen('')}} placeholder="Name oder Adresse"/></label>
    <label>Ort wählen<select value={chosen} onChange={e=>select(e.target.value)}><option value="">Ort wählen</option>{places.map(p=><option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}</select></label>
    {selected&&<><p className="ffm-catalog-meta">Hauptrubrik: {selected.category} · {selected.status==='published'?'Veröffentlicht':'Nicht veröffentlicht'}</p>
     <div className="ffm-catalog-tags">{categories.filter(c=>c.active).map(c=><label key={c.slug}>
      <input type="checkbox" checked={tags.includes(c.slug)} onChange={e=>setTags(prev=>e.target.checked?[...prev,c.slug]:prev.filter(v=>v!==c.slug))}/>{c.label_de}</label>)}</div>
     <button type="button" disabled={busy||tags.length<1||tags.length>8} onClick={()=>void send({place_id:chosen,categories:tags},'/api/categories/places')}>Zuordnung speichern ({tags.length}/8)</button></>}
   </section>
  </div>
 </div>;
}
