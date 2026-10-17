import {MercatorCoordinate} from 'maplibre-gl';
import type {Map as LibreMap,CustomLayerInterface} from 'maplibre-gl';
// Georeferenced, on-demand LoD2 on top of full-city vector buildings. GPU budget bounded.
const WEST=8.4,SOUTH=49.98,DX=.0018,DY=.0013,DETAIL_ZOOM=16.15;
const vertex=['attribute vec3 a_position; attribute vec3 a_color;','uniform mat4 u_matrix; varying vec3 v_color;','void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_color=a_color;}'].join('\n');
const fragment=['precision mediump float; varying vec3 v_color;','void main(){gl_FragColor=vec4(v_color,1.0);}'].join('\n');
type Face={s:number;g:number[][][][]};
type Payload={faces:Face[];partial:boolean};
type Tile={key:string;buffer:WebGLBuffer;count:number;origin:[number,number,number];used:number};
function program(gl:WebGLRenderingContext){
 const prog=gl.createProgram();if(!prog)throw Error('LoD2 GPU Programm fehlt');
 for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
  const sh=gl.createShader(type);if(!sh)throw Error('LoD2 GPU Shader fehlt');
  gl.shaderSource(sh,source);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'Shader ungültig');
  gl.attachShader(prog,sh);gl.deleteShader(sh);
 }
 gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog)||'Programm ungültig');
 return prog;
}
function triangleData(data:Payload,x:number,y:number){
 const origin=MercatorCoordinate.fromLngLat([WEST+(x+.5)*DX,SOUTH+(y+.5)*DY]);
 const meter=origin.meterInMercatorCoordinateUnits();
 const ground:number[]=[];
 for(const face of data.faces)if(face.s===710)for(const poly of face.g)for(const ring of poly)for(const point of ring)if(Number.isFinite(point[2]))ground.push(point[2]);
 if(!ground.length)return null;
 ground.sort((a,b)=>a-b);const base=ground[Math.floor(ground.length*.1)]??0,verts:number[]=[];
 for(const face of data.faces){
  const color=face.s===712?[.75,.58,.46]:face.s===709?[.62,.68,.65]:[.59,.64,.59];
  for(const poly of face.g){
   const ring=poly[0]?.slice(0,-1);
   if(!ring||ring.length<3||ring.length>90)continue;
   const pts=ring.map(([lon,lat,z])=>{
    if(!Number.isFinite(z)||lon<8.3||lon>8.95||lat<49.9||lat>50.3)return null;
    const m=MercatorCoordinate.fromLngLat([lon,lat]);
    return [m.x-origin.x,m.y-origin.y,Math.max(0,z-base)*meter];
   });
   if(pts.some(p=>!p))continue;
   for(let n=1;n<pts.length-1;n++)for(const idx of [0,n,n+1])verts.push(...pts[idx]!,...color);
   if(verts.length>360000)break;
  }
  if(verts.length>360000)break;
 }
 if(verts.length<54)return null;
 return {vertices:new Float32Array(verts),count:verts.length/6,origin:[origin.x,origin.y,origin.z] as [number,number,number]};
}
function required(map:LibreMap){
 if(map.getZoom()<DETAIL_ZOOM)return [] as {x:number;y:number;key:string}[];
 const b=map.getBounds(),center=map.getCenter(),out:{x:number;y:number;key:string;dist:number}[]=[];
 const xmin=Math.max(35,Math.floor((b.getWest()-WEST)/DX)),xmax=Math.min(240,Math.floor((b.getEast()-WEST)/DX));
 const ymin=Math.max(10,Math.floor((b.getSouth()-SOUTH)/DY)),ymax=Math.min(185,Math.floor((b.getNorth()-SOUTH)/DY));
 for(let x=xmin;x<=xmax;x++)for(let y=ymin;y<=ymax;y++){
  const lon=WEST+(x+.5)*DX,lat=SOUTH+(y+.5)*DY;
  out.push({x,y,key:x+':'+y,dist:(lon-center.lng)**2+(lat-center.lat)**2});
 }
 out.sort((a,b)=>a.dist-b.dist);
 return out.slice(0,12);
}
export function addCitywideLod2Layer(map:LibreMap){
 if(map.getLayer('ffm-citywide-lod2'))return;
 let shader:WebGLProgram|null=null,ctx:WebGLRenderingContext|null=null,disposed=false,first=false;
 const tiles=new Map<string,Tile>(),attempted=new Set<string>(),inflight=new Set<string>();
 let visible=new Set<string>(),timer:ReturnType<typeof setTimeout>|null=null;
 async function load(x:number,y:number,key:string){
  if(disposed||attempted.has(key))return;
  attempted.add(key);inflight.add(key);
  try{
   const r=await fetch('/api/lod2-tile?x='+x+'&y='+y);
   if(!r.ok)return;const raw=await r.json() as Payload;
   if(disposed||raw.partial||!Array.isArray(raw.faces))return;
   const mesh=triangleData(raw,x,y);if(!mesh||!ctx)return;
   const buffer=ctx.createBuffer();if(!buffer)return;
   ctx.bindBuffer(ctx.ARRAY_BUFFER,buffer);ctx.bufferData(ctx.ARRAY_BUFFER,mesh.vertices,ctx.STATIC_DRAW);
   tiles.set(key,{key,buffer,count:mesh.count,origin:mesh.origin,used:Date.now()});
   for(const old of [...tiles.values()].sort((a,b)=>a.used-b.used)){
    if(tiles.size<=24)break;
    if(!visible.has(old.key)){ctx.deleteBuffer(old.buffer);tiles.delete(old.key)}
   }
   console.info('FFM citywide LoD2 loaded',key,mesh.count/3,'triangles');map.triggerRepaint();
  }catch(e){console.info('FFM LoD2 district falls back to vector 3D',String(e).slice(0,100))}
  finally{inflight.delete(key);if(!disposed)schedule()}
 }
 function schedule(){
  if(disposed||!ctx)return;
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{
   if(disposed)return;
   const requested=required(map);visible=new Set(requested.map(v=>v.key));
   for(const v of requested){
    if(inflight.size>=2)break;
    if(!attempted.has(v.key))void load(v.x,v.y,v.key);
   }
   map.triggerRepaint();
  },320);
 }
 const layer:CustomLayerInterface={
  id:'ffm-citywide-lod2',type:'custom',renderingMode:'3d',
  onAdd(_m,gl){
   ctx=gl as WebGLRenderingContext;
   try{shader=program(ctx)}catch(e){console.warn('FFM LoD2 initialization',e);return}
   map.on('moveend',schedule);schedule();
  },
  render(gl,args){
   if(!shader||map.getZoom()<DETAIL_ZOOM||!visible.size)return;
   const c=gl as WebGLRenderingContext,m=args.defaultProjectionData.mainMatrix;
   c.useProgram(shader);c.enable(c.DEPTH_TEST);c.disable(c.CULL_FACE);
   const pos=c.getAttribLocation(shader,'a_position'),col=c.getAttribLocation(shader,'a_color');
   for(const tile of tiles.values()){
    if(!visible.has(tile.key))continue;
    tile.used=Date.now();
    const matrix=new Float32Array(m);
    for(let i=0;i<4;i++)matrix[12+i]=m[i]*tile.origin[0]+m[4+i]*tile.origin[1]+m[8+i]*tile.origin[2]+m[12+i];
    c.bindBuffer(c.ARRAY_BUFFER,tile.buffer);
    c.enableVertexAttribArray(pos);c.enableVertexAttribArray(col);
    c.vertexAttribPointer(pos,3,c.FLOAT,false,24,0);c.vertexAttribPointer(col,3,c.FLOAT,false,24,12);
    c.uniformMatrix4fv(c.getUniformLocation(shader,'u_matrix'),false,matrix);
    c.drawArrays(c.TRIANGLES,0,tile.count);
    if(!first){first=true;console.info('FFM citywide LoD2 GPU first draw',tile.count,'GL error',c.getError())}
    c.disableVertexAttribArray(pos);c.disableVertexAttribArray(col);
   }
  },
  onRemove(_m,gl){
   disposed=true;if(timer)clearTimeout(timer);map.off('moveend',schedule);
   const c=gl as WebGLRenderingContext;
   for(const tile of tiles.values())c.deleteBuffer(tile.buffer);
   tiles.clear();if(shader)c.deleteProgram(shader);shader=null;ctx=null;
  }
 };
 map.addLayer(layer,map.getLayer('ffm-poi-dot')?'ffm-poi-dot':undefined);
}
