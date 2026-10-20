/** Deadlines start before the remote style request, not after style.load.
 * A silent network stall must recover just like an explicit tile error. */
export function createMapLoadGuard(options:{
 onVectorTimeout:()=>void;
 onRasterTimeout:()=>void;
 schedule?:(callback:()=>void,delay:number)=>ReturnType<typeof setTimeout>;
 cancel?:(timer:ReturnType<typeof setTimeout>)=>void;
}){
 const schedule=options.schedule??setTimeout,cancel=options.cancel??clearTimeout;
 let stage:'vector'|'raster'|'ready'|'disposed'='vector';
 let timer:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{if(timer!==undefined){cancel(timer);timer=undefined}};
 const arm=(delay:number)=>{
  clear();timer=schedule(()=>{
   timer=undefined;
   if(stage==='vector')options.onVectorTimeout();
   else if(stage==='raster')options.onRasterTimeout();
  },delay);
 };
 arm(18000);
 return {
  useRaster(){if(stage==='disposed'||stage==='raster')return;stage='raster';arm(10000)},
  ready(){if(stage==='disposed')return;stage='ready';clear()},
  dispose(){stage='disposed';clear()}
 };
}
