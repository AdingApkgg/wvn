import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LayoutDashboard, Library, ShieldCheck, Users, ClipboardCheck, ArrowLeft, ScrollText } from 'lucide-react';
import { AccountConsumer, type ReaderAccount } from '../accounts/account-consumer';
import { ManagePanel } from './manage';
import { ShareAdminPanel } from './share-admin';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select';
import { brand } from '../brand';

export function meta() { return [{title:`全站管理 · ${brand.shortName}`},{name:'robots',content:'noindex,nofollow'}]; }
const sections = [
  {id:'',label:'概览',icon:LayoutDashboard},{id:'catalog',label:'作品与版本',icon:Library},
  {id:'classification',label:'内容分级',icon:ShieldCheck},{id:'shares',label:'分享审核',icon:ClipboardCheck},
  {id:'users',label:'用户管理',icon:Users},{id:'audit',label:'操作记录',icon:ScrollText},
];
export default function Dashboard() { return <AccountConsumer>{account=><DashboardPage account={account}/>}</AccountConsumer>; }
function DashboardPage({account}:{account:ReaderAccount}) {
  const {section=''}=useParams();
  if(account.loading) return <main className="container" role="status">正在验证管理权限…</main>;
  if(!account.me) return <main className="container"><h1>登录后进入后台</h1><Button asChild><Link to="/account?returnTo=%2Fdash">登录账号</Link></Button></main>;
  if(!account.me.admin) return <main className="container"><h1>暂无管理权限</h1><p>请使用已配置为管理员的账号登录。</p><Link to="/">返回目录</Link></main>;
  if(!sections.some(item=>item.id===section)) return <main className="container"><h1>没有这个管理页面</h1><Link to="/dash">返回后台</Link></main>;
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar"><Link className="brand" to="/dash">{brand.shortName}<span>全站管理</span></Link>
      <nav aria-label="后台导航">{sections.map(({id,label,icon:Icon})=><Link key={id} to={'/dash'+(id?'/'+id:'')} aria-current={section===id?'page':undefined}><Icon size={20} aria-hidden="true"/>{label}</Link>)}</nav>
      <Link to="/account?tab=security"><ArrowLeft size={18} aria-hidden="true"/>返回我的账号</Link>
    </aside>
    <div className="dashboard-main" key={account.me.user.id}>
      {!section&&<Overview account={account}/>}
      {(section==='catalog'||section==='classification')&&<ManagePanel key={section} apiPrefix="/api/dash/manage" section={section} binding={account.me.binding}/>}
      {section==='shares'&&<ShareAdminPanel apiPrefix="/api/dash/shares" binding={account.me.binding}/>}
      {section==='users'&&<UserManagement account={account}/>}
      {section==='audit'&&<Audit account={account}/>}
    </div>
  </div>;
}
type OverviewData={users:number;pendingShares:number;works:number|null;versions:number|null;contentEnabled:boolean};
function Overview({account}:{account:ReaderAccount}) {
  const [data,setData]=useState<OverviewData|null>(null),[error,setError]=useState(''),[version,refresh]=useState(0);
  useEffect(()=>{let active=true;setError('');void account.request<OverviewData>('/api/dash/overview').then(value=>{if(active)setData(value)}).catch(()=>{if(active)setError('概览加载失败，请重试。')});return()=>{active=false}},[account.request,version]);
  return <main className="container"><p className="eyebrow">{brand.shortName} ADMIN</p><h1>全站概览</h1><p className="text-muted-foreground">目录、审核与用户，集中在这里管理。</p><Button variant="outline" onClick={()=>refresh(n=>n+1)}>刷新概览</Button>
    <p role="status">{error||(!data?'正在读取数据…':'')}</p>{data&&<><div className="dashboard-stats">{[['作品',data.works],['版本',data.versions],['用户',data.users],['待审分享',data.pendingShares]].map(([label,value])=><Card key={String(label)}><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent><strong>{value??'暂不可用'}</strong></CardContent></Card>)}</div><div className="dashboard-shortcuts">{sections.filter(item=>item.id).map(({id,label,icon:Icon})=><Link key={id} to={'/dash/'+id}><Icon aria-hidden="true"/><span>{label}</span><span aria-hidden="true">→</span></Link>)}</div></>}
  </main>;
}
type UserRow={id:string;uid:string;name:string;published:boolean;joinedAt:string;eligibility:string};
const eligibility:Record<string,string>={unqualified:'未取得资格',qualified:'已取得资格',suspended:'资格暂停',needs_retest:'需要重测'};
function UserManagement({account}:{account:ReaderAccount}) {
  const [input,setInput]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<{items:UserRow[];next:number|null}|null>(null),[selected,setSelected]=useState<UserRow|null>(null),[action,setAction]=useState('suspend'),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  useEffect(()=>{let active=true;setData(null);void account.request<{items:UserRow[];next:number|null}>('/api/dash/users?q='+encodeURIComponent(query)+'&page='+page).then(value=>{if(active)setData(value)}).catch(()=>{if(active)setNotice('用户列表加载失败，请刷新重试。')});return()=>{active=false}},[query,page,reload,account.request]);
  async function moderate(){if(!selected)return;setBusy(true);setNotice('');try{await account.request('/api/dash/shares/content/users/'+encodeURIComponent(selected.id)+'/moderate',{action,reason});setNotice('资格状态已更新');setSelected(null);setReason('');setReload(n=>n+1)}catch{setNotice('操作未完成，请检查资格功能是否启用及理由是否完整；输入已保留。')}finally{setBusy(false)}}
  return <main className="container"><h1>用户管理</h1><p className="text-muted-foreground">查询账号和公开资料，管理内容浏览资格。</p><form className="dashboard-search" onSubmit={event=>{event.preventDefault();setPage(1);setSelected(null);setQuery(input.trim());setReload(n=>n+1);setNotice('')}}><Label htmlFor="user-search">查找用户</Label><Input id="user-search" value={input} onChange={e=>setInput(e.target.value)} maxLength={100} placeholder="昵称、UID 或账号 ID"/><Button>搜索</Button></form>
    <p role="status">{notice||(!data?'正在读取用户…':'')}</p><div className="dashboard-users">{data?.items.map(user=><Card key={user.uid}><CardHeader><CardTitle>{user.name}</CardTitle><p>UID {user.uid} · {eligibility[user.eligibility]??user.eligibility}</p></CardHeader><CardContent><p>{new Date(user.joinedAt).toLocaleDateString('zh-CN')} 加入 · 主页{user.published?'公开':'未公开'}</p><code className="break-all text-xs">{user.id}</code><div className="flex flex-wrap gap-2 mt-4">{user.published&&<Button variant="outline" asChild><Link to={'/u/'+user.uid}>查看主页</Link></Button>}<Button variant="outline" onClick={()=>{setSelected(user);setReason('');setNotice('')}}>管理资格</Button></div></CardContent></Card>)}</div>
    {data&&!data.items.length&&<p>没有匹配的用户。</p>}<div className="flex gap-2 mt-4"><Button variant="outline" disabled={page===1||!data} onClick={()=>{setPage(n=>n-1);setSelected(null)}}>上一页</Button><span className="self-center">第 {page} 页</span><Button variant="outline" disabled={!data?.next} onClick={()=>{setPage(data!.next!);setSelected(null)}}>下一页</Button><Button variant="ghost" onClick={()=>setReload(n=>n+1)}>刷新</Button></div>
    {selected&&<Card className="mt-6"><CardHeader><CardTitle>管理 {selected.name} 的内容资格</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={e=>{e.preventDefault();void moderate()}}><Label htmlFor="eligibility-action">操作</Label><NativeSelect id="eligibility-action" value={action} onChange={e=>setAction(e.target.value)}><NativeSelectOption value="suspend">暂停资格</NativeSelectOption><NativeSelectOption value="unsuspend">解除暂停</NativeSelectOption><NativeSelectOption value="revoke">撤销资格</NativeSelectOption><NativeSelectOption value="require_retest">要求重新测试</NativeSelectOption></NativeSelect><Label htmlFor="eligibility-reason">操作理由</Label><Input id="eligibility-reason" required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/><p className="text-sm text-muted-foreground">提交后立即更新内容浏览资格，并记录操作理由。</p><Button disabled={busy||!reason.trim()}>确认更新资格</Button><Button className="ml-2" type="button" variant="ghost" disabled={busy} onClick={()=>setSelected(null)}>取消</Button></form></CardContent></Card>}
  </main>;
}
type AuditRow={id:string;actor:string;action:string;target:string;reason:string;status:number|null;created_at:string};
function Audit({account}:{account:ReaderAccount}) {
  const [rows,setRows]=useState<AuditRow[]|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{let active=true;setError('');void account.request<AuditRow[]>('/api/dash/audit').then(value=>{if(active)setRows(value)}).catch(()=>{if(active)setError('操作记录读取失败。')});return()=>{active=false}},[account.request,reload]);
  return <main className="container"><h1>操作记录</h1><p>最近 100 次后台变更请求。</p><Button variant="outline" onClick={()=>setReload(n=>n+1)}>刷新记录</Button><p role="status">{error||(!rows?'正在读取记录…':'')}</p>{rows?.length===0&&<p>暂无操作记录。</p>}<div className="space-y-3">{rows?.map(row=><Card key={row.id}><CardContent className="pt-5 space-y-2"><p className="break-all"><strong>{row.action}</strong> {row.target}</p><p className="text-sm break-all">操作者：{row.actor}</p><p>{row.reason||'未附理由'}</p><p className="text-sm text-muted-foreground">{new Date(row.created_at).toLocaleString('zh-CN')} · {row.status===null?'结果待确认':row.status<400?'已完成':'未完成（'+row.status+'）'}</p></CardContent></Card>)}</div></main>;
}
