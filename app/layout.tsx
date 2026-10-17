import type {Metadata,Viewport} from 'next';
import './globals.css';
import './brand.css';
export const metadata:Metadata={title:'FFM Aktuell — Frankfurt. Immer wieder neu.',description:'Orte, Menschen und Geschichten, die Frankfurt besonders machen. Entdecke deine Stadt mit FFM Aktuell.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'},openGraph:{title:'FFM Aktuell | Frankfurt. Immer wieder neu.',description:'Dein persönlicher Stadtguide für Frankfurt am Main.',type:'website',locale:'de_DE'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#f8f8f5'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
