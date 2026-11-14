import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ReaderAccount } from './account-consumer';
import { AccountClientError } from './client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
export type OwnProfile={uid:string;name:string;bio:string;published:boolean;revision:number;joinedAt:string};
export function ProfileSettings({account}:{account:ReaderAccount}) {
  const [profile,setProfile]=useState<OwnProfile|null>(null),[name,setName]=useState(''),[bio,setBio]=useState(''),[published,setPublished]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{let active=true;setProfile(null);setNotice('');void account.request<OwnProfile>('/api/me/profile').then(value=>{if(active){setProfile(value);setName(value.name);setBio(value.bio);setPublished(value.published)}}).catch(()=>{if(active)setNotice('资料加载失败，请重试。')});return()=>{active=false}},[account.request,account.me?.user.id,reload]);
  async function save(){if(!profile)return;setBusy(true);setNotice('');try{const value=await account.request<OwnProfile>('/api/me/profile',{name,bio,published,revision:profile.revision},'PATCH',account.me?.user.id);setProfile(value);setName(value.name);setBio(value.bio);setNotice('个人资料已保存');await account.refresh();account.announce()}catch(error){setNotice(error instanceof AccountClientError&&error.code==='PROFILE_CONFLICT'?'资料已在其他页面修改。请先复制当前输入，再重新加载资料。':'保存失败，请检查昵称和简介后重试；输入已保留。')}finally{setBusy(false)}}
  return <Card><CardHeader><CardTitle><h2>个人资料</h2></CardTitle><CardDescription>主页由你决定是否公开，书架、游玩记录和私人存档不会展示。</CardDescription></CardHeader><CardContent><p role="status">{notice||(!profile?'正在读取资料…':'')}</p>{profile?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}><p className="text-sm">UID {profile.uid}</p><Label htmlFor="profile-name">昵称</Label><Input id="profile-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/><Label htmlFor="profile-bio">个人简介</Label><Textarea id="profile-bio" value={bio} onChange={e=>setBio(e.target.value)} maxLength={400} placeholder="介绍一下自己，最多 200 字"/><Label className="profile-publish" htmlFor="profile-published"><input id="profile-published" type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>公开我的主页</Label><p className="text-sm text-muted-foreground">公开后显示昵称、简介、加入时间，以及已审核的有效公开分享。</p><div className="flex flex-wrap gap-2"><Button disabled={busy}>保存个人资料</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setReload(n=>n+1)}>重新加载资料</Button>{profile.published&&<Button asChild variant="outline"><Link to={'/u/'+profile.uid}>查看我的主页</Link></Button>}{account.me?.admin&&<Button asChild variant="outline"><Link to="/dash">进入全站后台</Link></Button>}</div></form>:<Button variant="outline" onClick={()=>setReload(n=>n+1)}>重试</Button>}</CardContent></Card>;
}
