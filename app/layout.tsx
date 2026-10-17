import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'FFM Aktuell — Deine Stadt. Neu entdeckt.',description:'Frankfurt entdecken: Orte, Kultur und lokale Geschichten.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#183b36'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
