'use client';
import {useEffect} from 'react';
/** Focus only the topmost modal, contain keyboard navigation and restore the opener. */
export function useModalFocus(active:boolean,onClose:()=>void){
 useEffect(()=>{
  if(!active)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const dialogs=document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),dialog=dialogs[dialogs.length-1];if(!dialog)return;
  const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(e=>!e.hasAttribute('disabled')&&!e.closest('[hidden],[inert]')&&e.getClientRects().length>0);
  const outside:Array<{element:HTMLElement;inert:boolean}>=[];
  let branch:HTMLElement=dialog;
  while(branch.parentElement&&branch.parentElement!==document.body){for(const sibling of Array.from(branch.parentElement.children))if(sibling!==branch&&sibling instanceof HTMLElement){outside.push({element:sibling,inert:sibling.inert});sibling.inert=true}branch=branch.parentElement}
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  (controls()[0]||dialog).focus();
  function keydown(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return}
   if(event.key!=='Tab')return;const nodes=controls();
   if(!nodes.length){event.preventDefault();dialog.focus();return}
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',keydown,true);
  return()=>{document.removeEventListener('keydown',keydown,true);for(const {element,inert}of outside)element.inert=inert;document.body.style.overflow=previousOverflow;if(opener?.isConnected)opener.focus()};
 },[active,onClose]);
}
