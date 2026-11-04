import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AccountClientError, errorCopy } from "./client";
import type { LibraryEntry } from "./library.server";
import { Button } from "../components/ui/button";
import {AccountConsumer,type ReaderAccount} from './account-consumer';

export function ShelfButton({ workId, workUrl }: { workId: string; workUrl: string }) {
  return <AccountConsumer>{account=><ShelfAction account={account} workId={workId} workUrl={workUrl}/>}</AccountConsumer>;
}
function ShelfAction({account,workId,workUrl}:{account:ReaderAccount;workId:string;workUrl:string}) {
  const owner=account.me?.user.id,{request}=account;
  const [added,setAdded]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{let live=true;setAdded(null);setMessage("");if(owner)void request<LibraryEntry[]>("/api/me/library",undefined,undefined,owner).then(rows=>{if(live)setAdded(rows.some(row=>row.workId===workId))}).catch(()=>{if(live)setMessage("书架状态暂不可用，请稍后重试。")});return()=>{live=false}},[owner,workId,request]);
  if(!owner)return <Button asChild variant="outline"><Link to={"/account?returnTo="+encodeURIComponent(workUrl)}>加入书架</Link></Button>;
  return <div><Button variant="outline" disabled={added===null||added||busy} onClick={async()=>{setBusy(true);setMessage("");const check=account.guard();try{await request(`/api/me/library/${workId}`,{revision:0,status:"wanted"},"PATCH",owner);check();setAdded(true)}catch(error){setMessage(errorCopy(error instanceof AccountClientError?error.code:"NETWORK"))}finally{setBusy(false)}}}>{added?"已加入书架":busy?"正在加入…":"加入书架"}</Button>{message&&<p className="text-sm" role="status">{message}</p>}</div>;
}
