import type {Metadata,Viewport} from 'next';
import './globals.css';
import './brand.css';
import './atlas.css';
import './vorschau.css';
import './stadtstudio.css';
export const metadata:Metadata={title:'FFM Aktuell | Frankfurt Living Atlas 3D',description:'Erlebe Frankfurt neu: echte Stadtkarte mit 3D-Gebäuden, Orten und Stadtteilen. Entdecke die Stadt mit FFM Aktuell.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'},openGraph:{title:'FFM Aktuell — Frankfurt Living Atlas',description:'Deine Stadt in 3D. Orte, Viertel und Perspektiven entdecken.',type:'website',locale:'de_DE'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#f6f5f1'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
