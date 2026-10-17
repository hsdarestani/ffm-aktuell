import {MercatorCoordinate} from 'maplibre-gl';
import type {Map as LibreMap,CustomLayerInterface} from 'maplibre-gl';

type Surface={b:number;s:number;g:number[][][][]};
type Model={bbox:string;features:Surface[]};
const vertex=`attribute vec3 a_position; attribute vec3 a_color;
uniform mat4 u_matrix; varying vec3 v_color;
void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_color=a_color;}`;
const fragment=`precision mediump float; varying vec3 v_color;
void main(){gl_FragColor=vec4(v_color,1.0);}`;
function compile(gl:WebGLRenderingContext,kind:number,source:string){
 const s=gl.createShader(kind);if(!s)throw Error('LoD2 Shader fehlt');
 gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'LoD2 Shaderfehler');
 return s;
}
function program(gl:WebGLRenderingContext){
 const p=gl.createProgram();if(!p)throw Error('WebGL nicht verfügbar');
 const v=compile(gl,gl.VERTEX_SHADER,vertex),f=compile(gl,gl.FRAGMENT_SHADER,fragment);
 gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'LoD2 Shaderlink');
 return p;
}
function triangles(data:Model){
 const origin=MercatorCoordinate.fromLngLat([8.671,50.110]);
 const meter=origin.meterInMercatorCoordinateUnits(),values:number[]=[];
 for(const f of data.features)if(f.s===710)
  for(const poly of f.g)for(const ring of poly)for(const p of ring)
   if(Number.isFinite(p[2]))values.push(p[2]);
 if(!values.length)for(const f of data.features)
  for(const poly of f.g)for(const ring of poly)for(const p of ring)
   if(Number.isFinite(p[2]))values.push(p[2]);
 values.sort((a,b)=>a-b);
 const base=values[Math.floor(values.length*.04)]??96,coords:number[]=[];
 for(const feature of data.features){
  const color=feature.s===712?[.77,.61,.48]:feature.s===709?[.66,.69,.66]:[.59,.66,.59];
  for(const polygon of feature.g){
   const ring=polygon[0]?.slice(0,-1);
   if(!ring||ring.length<3||ring.length>80)continue;
   const projected=ring.map(([lon,lat,z])=>{
    if(!Number.isFinite(z)||lon<8.65||lon>8.69||lat<50.09||lat>50.13)return null;
    const m=MercatorCoordinate.fromLngLat([lon,lat]);
    return [m.x-origin.x,m.y-origin.y,Math.max(0,z-base+.4)*meter];
   });
   if(projected.some(p=>!p))continue;
   // LoD2 roofs and walls are mostly planar quads. Fan triangulation approximates
   // more complex concave polygons without inventing any building footprint.
   for(let n=1;n<ring.length-1;n++)for(const index of [0,n,n+1]){
    const p=projected[index]!;
    coords.push(p[0],p[1],p[2],...color);
   }
  }
 }
 if(coords.length>600000)throw Error('LoD2 vertices exceeded device budget');
 return {vertices:new Float32Array(coords),count:coords.length/6,origin};
}
export function addRealLod2Layer(map:LibreMap,onLoaded:(triangles:number)=>void){
 if(map.getLayer('ffm-real-lod2'))return;
 let shader:WebGLProgram|null=null,buffer:WebGLBuffer|null=null,count=0,disposed=false;
 let origin=[0,0,0],draws=0;
 const layer:CustomLayerInterface={
  id:'ffm-real-lod2',type:'custom',renderingMode:'3d',
  onAdd(m,gl){
   console.info('FFM LoD2 custom layer onAdd initialized');
   const ctx=gl as WebGLRenderingContext;
   fetch('/lod2/frankfurt-preview.json').then(r=>{if(!r.ok)throw Error('LoD2-Daten nicht bereit');return r.json()})
    .then((model:Model)=>{
     if(disposed||!Array.isArray(model.features))return;
     console.info('FFM LoD2 downloaded real surfaces:',model.features.length);
     const geo=triangles(model);
     console.info('FFM LoD2 constructed GPU vertices:',geo.count);
     if(geo.count<90)return;
     shader=program(ctx);buffer=ctx.createBuffer();if(!buffer)throw Error('GPU-Puffer fehlt');
     ctx.bindBuffer(ctx.ARRAY_BUFFER,buffer);ctx.bufferData(ctx.ARRAY_BUFFER,geo.vertices,ctx.STATIC_DRAW);
     count=geo.count;origin=[geo.origin.x,geo.origin.y,geo.origin.z];
     onLoaded(count/3);console.info('FFM LoD2 render model ready:',count/3,'triangles');m.triggerRepaint();
    }).catch(e=>console.warn('FFM LoD2:',e));
  },
  render(gl,args){
   if(!shader||!buffer||!count)return;
   const ctx=gl as WebGLRenderingContext,m=args.defaultProjectionData.mainMatrix;
   const matrix=new Float32Array(m);
   for(let i=0;i<4;i++)matrix[12+i]=m[i]*origin[0]+m[4+i]*origin[1]+m[8+i]*origin[2]+m[12+i];
   ctx.useProgram(shader);ctx.bindBuffer(ctx.ARRAY_BUFFER,buffer);
   const pos=ctx.getAttribLocation(shader,'a_position'),color=ctx.getAttribLocation(shader,'a_color');
   ctx.enableVertexAttribArray(pos);ctx.enableVertexAttribArray(color);
   ctx.vertexAttribPointer(pos,3,ctx.FLOAT,false,24,0);ctx.vertexAttribPointer(color,3,ctx.FLOAT,false,24,12);
   ctx.uniformMatrix4fv(ctx.getUniformLocation(shader,'u_matrix'),false,matrix);
   ctx.enable(ctx.DEPTH_TEST);ctx.disable(ctx.CULL_FACE);
   ctx.drawArrays(ctx.TRIANGLES,0,count);
   if(draws++===0)console.info('FFM LoD2 GPU first draw',count,'GL error',ctx.getError());
   ctx.disableVertexAttribArray(pos);ctx.disableVertexAttribArray(color);
  },
  onRemove(_map,gl){
   console.info('FFM LoD2 custom layer removed');
   disposed=true;const ctx=gl as WebGLRenderingContext;
   if(buffer)ctx.deleteBuffer(buffer);if(shader)ctx.deleteProgram(shader);
   buffer=null;shader=null;count=0;
  }
 };
 map.addLayer(layer,map.getLayer('ffm-poi-dot')?'ffm-poi-dot':undefined);
}
