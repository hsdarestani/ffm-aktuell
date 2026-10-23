'use client';
import {createContext,useCallback,useContext,useEffect,useState,type Dispatch,type SetStateAction,type ReactNode} from 'react';
import english from '@/lib/ui-en.json';
export type UiLocale='de'|'en';
const dictionary:Readonly<Record<string,string>>=english;
export function uiText(locale:UiLocale,source:string):string{
 const key=source.trim();const translated=locale==='en'?dictionary[key]??key:key==='Unsere Geschichten.'?'Geschichten aus Frankfurt.':key;
 return source.slice(0,source.indexOf(key))+translated+source.slice(source.indexOf(key)+key.length);
}
const UiContext=createContext<{locale:UiLocale;setLocale:Dispatch<SetStateAction<UiLocale>>}>({locale:'de',setLocale:()=>{}});
export function UiLanguageProvider({children}:{children:ReactNode}){
 const [locale,setLocale]=useState<UiLocale>('de'),[restored,setRestored]=useState(false);
 useEffect(()=>{try{if(localStorage.getItem('ffm_ui_language')==='en')setLocale('en')}catch{}setRestored(true)},[]);
 useEffect(()=>{document.documentElement.lang=locale;if(restored)try{localStorage.setItem('ffm_ui_language',locale)}catch{}},[locale,restored]);
 return <UiContext.Provider value={{locale,setLocale}}>{children}</UiContext.Provider>;
}
export const useUiLocale=()=>useContext(UiContext);
/** Explicit UI literals only. User content must use the opt-in translation workflow. */
export function useUiText(){const {locale}=useUiLocale();return Object.assign(useCallback((source:string)=>uiText(locale,source),[locale]),{locale})}

export function UiLanguageSwitch(){const {locale,setLocale}=useUiLocale();return <button type="button" className="ffm-language-toggle" aria-label={locale==='de'?'EN · Switch to English':'DE · Switch to German'} title={locale==='de'?'English':'Deutsch'} onClick={()=>setLocale(v=>v==='de'?'en':'de')}>{locale==='de'?'EN':'DE'}</button>}
