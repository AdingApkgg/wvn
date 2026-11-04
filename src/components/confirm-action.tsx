import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "./ui/alert-dialog";

export function useActionConfirmation() {
  const [message,setMessage]=useState<{title:string;description:string;label:string}|null>(null);
  const pending=useRef<((value:boolean)=>void)|null>(null);
  const active=useRef(false),trigger=useRef<HTMLElement|null>(null);
  function settle(value:boolean) { const resolve=pending.current;pending.current=null;setMessage(null);resolve?.(value); }
  useEffect(()=>{
    active.current=true;
    const cancel=()=>settle(false);
    window.addEventListener("wg-account-invalidated",cancel);
    return()=>{active.current=false;window.removeEventListener("wg-account-invalidated",cancel);pending.current?.(false);pending.current=null;};
  },[]);
  function ask(title:string,description:string,label="确认继续") {
    if(!active.current||pending.current)return Promise.resolve(false);
    trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setMessage({title,description,label});
    return new Promise<boolean>(resolve=>{pending.current=resolve;});
  }
  const dialog=<AlertDialog open={!!message} onOpenChange={open=>{if(!open)settle(false)}}><AlertDialogContent onCloseAutoFocus={event=>{event.preventDefault();if(!active.current)return;const target=trigger.current?.isConnected?trigger.current:document.querySelector<HTMLElement>("main h1,main h2,main");if(target){if(!target.hasAttribute("tabindex")&&!target.matches("a,button,input,select,textarea"))target.tabIndex=-1;target.focus();}}}><AlertDialogHeader><AlertDialogTitle>{message?.title}</AlertDialogTitle><AlertDialogDescription>{message?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={()=>settle(false)}>取消</AlertDialogCancel><AlertDialogAction onClick={()=>settle(true)}>{message?.label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
  return {ask,dialog};
}
