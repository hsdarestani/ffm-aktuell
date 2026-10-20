export type ScreenPin={id:string;left:number;top:number};
/** Keep label rectangles apart and reserve space for map controls on phones. */
export function visibleMapPins<T extends ScreenPin>(pins:T[],width:number,height:number,selectedId?:string|null):T[]{
 const narrow=width<=650,labelWidth=narrow?100:145,max=narrow?9:18;
 const inset=labelWidth/2+12,top=narrow?150:155,bottom=height-120;
 const candidates=pins.filter(p=>Number.isFinite(p.left)&&Number.isFinite(p.top)&&
  p.left>=inset&&p.left<=width-inset&&p.top>=top&&p.top<=bottom);
 const middleY=(top+bottom)/2;
 candidates.sort((a,b)=>{
  if(a.id===selectedId)return -1;if(b.id===selectedId)return 1;
  const distance=(p:T)=>(p.left-width/2)**2+(p.top-middleY)**2;
  return distance(a)-distance(b)||a.id.localeCompare(b.id);
 });
 const shown:T[]=[];
 for(const point of candidates){
  if(shown.some(other=>Math.abs(other.left-point.left)<labelWidth+12&&Math.abs(other.top-point.top)<38))continue;
  shown.push(point);if(shown.length>=max)break;
 }
 return shown;
}
export const isRawMapId=(id:string)=>/^(?:osm:|node\/|way\/|relation\/)/.test(id);
