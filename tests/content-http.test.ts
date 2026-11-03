import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {createContentFetch} from '../src/content/http.server.ts';
import {PUBLIC_CONTENT_ACCESS} from '../src/content/policy.ts';
import type {Store} from '../src/server/store.ts';
import {createPublicApp} from '../src/server/http.ts';

const evidence={reason:'测试',source:'fixture',reviewedAt:'2026-11-03T00:00:00Z',revision:1};
const works:any[]=[{id:'v4',title:'公共资料',originalTitle:'',aliases:[],evidence:'',revision:1,defaultVersionId:'adult',url:'/4/',classification:{...evidence,pageSuitability:'sfw'},versions:[{id:'adult',workId:'v4',number:1,title:'未审核版本名称',url:'/4/1/',launchPath:'/legacy/',engine:'ONS',checks:[],notes:'敏感备注',classification:{...evidence,sexualContent:'unknown',titleSafe:false}}]},
 {id:'v17',title:'敏感作品标题',originalTitle:'',aliases:[],evidence:'',revision:1,url:'/17/',classification:{...evidence,pageSuitability:'nsfw'},versions:[]}];
const store={list:async()=>works,get:async(id:string)=>works.find(w=>w.id===id),raw:async(id:string)=>{const v=works.flatMap(w=>w.versions).find(v=>v.id===id);return v?{...v,legacyPath:'/legacy/'}:undefined}} as unknown as Store;
function fixture(access=PUBLIC_CONTENT_ACCESS){
 const app=new Hono();
 app.get('/api/catalog',c=>c.json(works));
 app.get('/api/account-catalog',c=>c.json(works));
 app.get('/api/works/:id',c=>c.json(works.find(w=>w.id===(c.req.param('id').startsWith('v')?c.req.param('id'):'v'+c.req.param('id')))));
 app.get('/api/versions/:id/resources',c=>c.json({private:'resource mapping'}));
 app.get('/api/resources/manifest',c=>c.json({private:'all mappings'}));
 app.get('/api/public/save-shares/:id',c=>c.json({id:'share',title:'未审核分享',description:'敏感分享文案',work:{id:'v4'},version:{id:'adult'}}));
 app.get('/api/me/library',c=>c.json([{workId:'v17',note:'敏感私人说明',status:'wanted'}]));
 app.get('/api/me/export',c=>c.json({privateBackup:true}));
 app.get('/legacy/*',c=>c.json({hidden:'旧入口游戏内容'}));
 const run=createContentFetch(app.fetch,store,{enabled:true,access:async()=>access});
 return (path:string)=>run(new Request('https://fixture.test'+path));
}
test('应用目录投影同时过滤作品与受限版本细节，匿名账号目录不能枚举隐藏编号',async()=>{
 const run=fixture();
 const catalog=await(await run('/api/catalog')).json();
 assert.equal(catalog.length,1);assert.equal(catalog[0].versions[0].launchPath,'');
 assert(!JSON.stringify(catalog).includes('未审核版本名称'));
 const own=await(await run('/api/account-catalog')).json();
 assert.equal(own.length,1);assert(!JSON.stringify(own).includes('v17'));
 const response=await run('/api/works/v17');assert.equal(response.status,401);
 assert.equal((await run('/api/works/17')).status,401);
 assert(!await response.text().then(t=>t.includes('敏感作品标题')));
});
test('个人目录只为自己已有记录保留中性占位',async()=>{
 const run=createContentFetch(()=>Response.json([...works,{...works[1],id:'v99'}]),store,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS,authenticated:true}),ownWorkIds:async()=>new Set(['v17'])});
 const response=await run(new Request('https://fixture.test/api/account-catalog'));
 const rows=await response.json();assert.equal(rows.length,2);assert.equal(rows[1].id,'v17');assert.equal(rows[1].title,'受限作品');assert(!JSON.stringify(rows).includes('v99'));
});
test('已开启资格也不能通过分享读取待复审作品，领取状态GET不受正文门槛干扰',async()=>{
 const unknown={...works[0],classification:{...evidence,pageSuitability:'unknown'}};
 const restricted={...PUBLIC_CONTENT_ACCESS,authenticated:true,eligibility:'qualified' as const,displayMode:'restricted' as const,canViewRestricted:true};
 const app=new Hono();app.get('/api/public/save-shares/:id',c=>c.json({id:'share',title:'旧分享标题',work:{id:'v4'},version:{id:'adult'}}));app.get('/api/me/share-claims/:id',c=>c.json({status:'ready'}));
 const run=createContentFetch(app.fetch,{...store,list:async()=>[unknown]} as Store,{enabled:true,access:async()=>restricted});
 const response=await run(new Request('https://fixture.test/api/public/save-shares/share'));assert.equal(response.status,403);assert(!(await response.text()).includes('旧分享标题'));
 const status=await createContentFetch(app.fetch,store,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS,authenticated:true})})(new Request('https://fixture.test/api/me/share-claims/own'));
 assert.equal(status.status,200);
});
test('匿名无法从版本清单或通用资源索引绕过资格，备份导出保持可用',async()=>{
 const run=fixture();
 assert.equal((await run('/api/versions/adult/resources')).status,401);
 assert.equal((await run('/api/resources/manifest')).status,404);
 assert.equal((await run('/api/me/export')).status,200);
});
test('资格已通过仍需主动开启；合格开启后版本清单可用',async()=>{
 const qualified={...PUBLIC_CONTENT_ACCESS,authenticated:true,eligibility:'qualified' as const};
 assert.equal((await fixture(qualified)('/api/versions/adult/resources')).status,403);
 const opened={...qualified,displayMode:'restricted' as const,canViewRestricted:true};
 assert.equal((await fixture(opened)('/api/versions/adult/resources')).status,200);
});
test('未审核分享返回中性拒绝，个人书架备注不泄露但条目不删除',async()=>{
 const run=fixture();
 const response=await run('/api/public/save-shares/share');
 assert.equal(response.status,401);assert(!await response.text().then(t=>t.includes('敏感分享文案')));
 const rows=await(await run('/api/me/library')).json();
 assert.equal(rows.length,1);assert.equal(rows[0].note,'');
});
test('公共模式修改阅读状态的回执也隐藏原备注而不改变保存语义',async()=>{
 const app=new Hono();let updated=false;
 app.patch('/api/me/library/:id',async c=>{const body=await c.req.json();assert.equal(Object.hasOwn(body,'note'),false);updated=true;return c.json({workId:'v4',status:body.status,note:'已有私人笔记',revision:2})});
 const run=createContentFetch(app.fetch,store,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS,authenticated:true})});
 const response=await run(new Request('https://fixture.test/api/me/library/v4',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({revision:1,status:'completed'})}));
 assert(updated);assert.equal(response.status,200);const row=await response.json();assert.equal(row.note,'');assert.equal(row.status,'completed');
});
test('权限依赖失败不会回退已获资格，受限接口503而私人导出仍可用',async()=>{
 const app=new Hono();app.get('*',c=>c.json({ok:true}));
 const run=createContentFetch(app.fetch,store,{enabled:true,access:async()=>{throw Error('不可用')}});
 assert.equal((await run(new Request('https://fixture.test/api/versions/adult/resources'))).status,503);
 assert.equal((await run(new Request('https://fixture.test/api/me/export'))).status,200);
 assert.equal((await run(new Request('https://fixture.test/health'))).status,200);
 assert.equal((await run(new Request('https://fixture.test/assets/app.js'))).status,200);
 assert.equal((await run(new Request('https://fixture.test/api/me/share-claims/own'))).status,200);
 const lists=createContentFetch(()=>Response.json(works),store,{enabled:true,access:async()=>{throw Error('不可用')}});
 assert.equal((await(await lists(new Request('https://fixture.test/api/catalog'))).json()).length,1);
});
test('保留的旧资源路径也不能绕过资格直接读取游戏正文',async()=>{
 const previous=process.env.WG_CONTENT_GATE;process.env.WG_CONTENT_GATE='1';
 try{const response=await createPublicApp(store,'/nonexistent').fetch(new Request('https://fixture.test/legacy/chapter.js'));
 assert.equal(response.status,401)}finally{if(previous===undefined)delete process.env.WG_CONTENT_GATE;else process.env.WG_CONTENT_GATE=previous}
});
test('分享领取的前置资格检查读取JSON也必须限制请求体大小',async()=>{
 const run=createContentFetch(()=>Response.json({ok:true}),store,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS,authenticated:true})});
 const response=await run(new Request('https://fixture.test/api/me/share-downloads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shareId:'share',pad:'x'.repeat(70*1024)})}));
 assert.equal(response.status,413);
});
test('实际文件监听器也对下划线和根目录旧入口应用版本权限',async()=>{
 const previous=process.env.WG_CONTENT_GATE;process.env.WG_CONTENT_GATE='1';
 try{for(const legacyPath of ['/__novel/','/']){
  const actualStore={...store,raw:async()=>({...works[0].versions[0],legacyPath})} as unknown as Store;
  const app=createPublicApp(actualStore,'/nonexistent');
  const response=await app.fetch(new Request('https://fixture.test'+legacyPath+'index.html'));
  assert.equal(response.status,401,legacyPath);
 }}finally{if(previous===undefined)delete process.env.WG_CONTENT_GATE;else process.env.WG_CONTENT_GATE=previous}
});
