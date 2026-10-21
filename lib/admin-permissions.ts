export const ADMIN_CAPABILITIES=['editorial','moderation','business','marketing','finance','operations'] as const;
export type AdminCapability=typeof ADMIN_CAPABILITIES[number];
type Actor={role:string;admin_permissions?:string[]}|null|undefined;
export function canAdmin(user:Actor,permission:AdminCapability|'access'='access'){
 if(!user)return false;if(user.role==='admin')return true;
 const permissions=user.admin_permissions||[];
 return permission==='access'?permissions.some(p=>ADMIN_CAPABILITIES.includes(p as AdminCapability)):permissions.includes(permission);
}
