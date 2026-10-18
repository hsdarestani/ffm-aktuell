import type {Metadata,Viewport} from 'next';
import './globals.css';
import './brand.css';
import './atlas.css';
import './atlas-readable.css';
import './vorschau.css';
import './place-location.css';
import './place-actions.css';
import './venue-reviews.css';
import './post-engagement.css';
import './saved-places.css';
import './quick-home.css';
import './find-fast.css';
import './stadtstudio.css';
import './stadtstudio-simple.css';
export const metadata:Metadata={title:'FFM Aktuell | Frankfurt einfach entdecken',description:'Finde Cafés, Restaurants, Aktivitäten und Orte in Frankfurt. Einfach suchen, schnell entdecken und Quellen transparent prüfen.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'},openGraph:{title:'FFM Aktuell — Frankfurt einfach entdecken',description:'Finde schnell, was du in Frankfurt erleben möchtest.',type:'website',locale:'de_DE'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#f6f5f1'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
