'use client';
import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {useUiText} from '@/lib/ui-locale';
/** A local, explicitly illustrative fallback when a content photograph cannot load. */
export default function ContentImage({src,alt,onError,...props}:ImgHTMLAttributes<HTMLImageElement>){
 const ui=useUiText(),[failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return <img {...props} src={failed?'/images/city-illustration.svg':src} alt={failed?ui('Bild nicht verfügbar · Illustration'):alt} data-image-fallback={failed||undefined} onError={event=>{if(!failed)setFailed(true);onError?.(event)}}/>;
}
