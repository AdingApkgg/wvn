import {useState} from 'react';
import {Link} from 'react-router';
import type {ReaderAccount} from './account-consumer';
import {AccountClientError} from './client';
import {Card,CardHeader,CardTitle,CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {Label} from '../components/ui/label';
import {Textarea} from '../components/ui/textarea';

export type AdminUser={id:string;uid:string;name:string;admin:boolean;adminProtected:boolean;adminRevision:number};
export function AdminRoleEditor({user,account,onSaved,onCancel}:{user:AdminUser;account:ReaderAccount;onSaved:()=>void;onCancel:()=>void}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reauth,setReauth]=useState(false);
 const action=user.admin?'revoke':'grant';
 async function submit(){
  setBusy(true);setError('');setReauth(false);
  try{
   await account.api.dashAdminChange({params:{uid:user.uid},body:{action,revision:user.adminRevision,reason}},{context:{owner:account.me?.user.id}});
   onSaved();
  }catch(e){
   const code=e instanceof AccountClientError?e.code:'';
   setReauth(code==='REAUTH_REQUIRED');
   setError(code==='REAUTH_REQUIRED'?'请先在账号设置中重新验证通行密钥，再返回操作。':code==='ADMIN_CONFLICT'?'此用户的权限已变化，请重新查询后再操作。':code==='ADMIN_PROTECTED'?'该管理员受到保护，不能在后台修改。':code==='ADMIN_REQUIRED'?'你的管理权限已被撤销，请刷新页面。':'权限修改未完成，请检查理由后重试；输入已保留。');
  }finally{setBusy(false)}
 }
 return <Card className="mt-6"><CardHeader><CardTitle>{user.admin?'撤销':'授予'} {user.name} 的管理员权限</CardTitle></CardHeader><CardContent><p className="mb-4">UID {user.uid} · {user.admin?'撤销后将立即失去后台访问和管理权限，普通账号资料保留。':'管理员可以管理全站内容，并为其他用户授予或撤销管理员权限。'}</p><form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit()}}><Label htmlFor="admin-role-reason">权限变更理由</Label><Textarea id="admin-role-reason" required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/>{error&&<p role="alert">{error}</p>}{reauth&&<Button asChild variant="outline"><Link to="/account?tab=security">前往账号设置重新验证</Link></Button>}<div className="flex flex-wrap gap-2"><Button disabled={busy||!reason.trim()} variant={user.admin?'destructive':'default'}>确认{user.admin?'撤销':'授予'}管理员</Button><Button type="button" disabled={busy} variant="ghost" onClick={onCancel}>取消权限变更</Button></div></form></CardContent></Card>;
}
