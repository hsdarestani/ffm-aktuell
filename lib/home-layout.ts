export const homeModules=['choices','highlights','tips','assistant','community','news'] as const;
export type HomeModule={code:typeof homeModules[number];enabled:boolean};
export const defaultHomeLayout:HomeModule[]=homeModules.map(code=>({code,enabled:true}));
export function validHomeLayout(raw:unknown):raw is HomeModule[]{return Array.isArray(raw)&&raw.length===homeModules.length&&new Set(raw.map(x=>x?.code)).size===homeModules.length&&raw.every(x=>x&&homeModules.includes(x.code)&&typeof x.enabled==='boolean')}
