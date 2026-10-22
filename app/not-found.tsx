'use client';
import {useUiText} from '@/lib/ui-locale';
export default function NotFound(){const ui=useUiText();return <main style={{minHeight:'70vh',display:'grid',placeItems:'center',fontFamily:'sans-serif'}}><div><h1>404</h1><p>{ui("Diese Seite gibt es nicht.")}</p><a href="/" style={{borderBottom:'1px solid currentColor',paddingBottom:4}}>{ui("Zur Startseite")}</a></div></main>}

