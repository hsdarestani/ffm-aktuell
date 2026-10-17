import type {Metadata,Viewport} from 'next';
import './globals.css';
import './brand.css';
export const metadata:Metadata={title:'FFM Aktuell — Die Stadt ist nicht still.',description:'Frankfurt ist in Bewegung. Entdecke Orte mit Charakter, Events und Menschen, die die Stadt bewegen.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'},openGraph:{title:'FFM Aktuell / Signal 069',description:'Die Stadt ist nicht still. Frankfurt neu entdecken.',type:'website',locale:'de_DE'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#17191b'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
