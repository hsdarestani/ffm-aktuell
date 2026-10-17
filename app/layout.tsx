import type {Metadata,Viewport} from 'next';
import './globals.css';
import './brand.css';
export const metadata:Metadata={title:'FFM Aktuell | Frankfurt von innen',description:'Frankfurt von innen. Entdecke besondere Orte, Stadtgeschichten, Menschen und Erlebnisse. Unabhängig und lokal.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'},openGraph:{title:'FFM Aktuell — Frankfurt von innen',description:'Eine Stadt, tausend Blickwinkel. Entdecke Frankfurt neu.',type:'website',locale:'de_DE'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#f6f5f1'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
