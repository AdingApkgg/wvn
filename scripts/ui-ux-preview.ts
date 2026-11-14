/** UI/UX 专用远程 QA/预览：仅操作wvn_qa与本任务拥有的schema。 */
import {hostname} from 'node:os';
import {readFile,mkdir,writeFile,stat,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {request} from 'node:https';
import {createServer} from 'node:https';
import {serve} from '@hono/node-server';
import {createRequestHandler,RouterContextProvider} from 'react-router';
import {Pool} from 'pg';
import {PgDatabase} from '../src/database/postgres.ts';
import {Store} from '../src/server/store.ts';
import {MeiliClient} from '../src/search/meili.server.ts';
import {documents} from '../src/search/projection.server.ts';
import {createAdminApp} from '../src/server/http.ts';
import {Auth} from '../src/server/auth.ts';
import {fileResponse} from '../src/server/resources.ts';

const root=resolve('.'),base=resolve(root,'..'),privateDir=join(base,'private');
// 部署侧必须显式指定远程主机、隔离预览地址和绑定地址。
const task=process.env.WG_UI_UX_TASK??'ui-ux-20261104';
if(!['ui-ux-20261104','m3-20261114','ios-reader-auth-20261114','dashboard-20261114','dashboard-release-20261114'].includes(task))throw Error('未知的隔离预览任务');
const port=task==='dashboard-release-20261114'?25483:task==='dashboard-20261114'?25383:task==='ios-reader-auth-20261114'?25283:task==='m3-20261114'?24883:24683;
const preview=new URL(process.env.WG_UI_UX_TEST_URL??`https://build.example.test:${port}`);
const origin=preview.origin,bind=process.env.WG_UI_UX_BIND??'127.0.0.1';
if(preview.protocol!=='https:'||preview.port!==String(port)||preview.username||preview.password||!/^[-a-zA-Z0-9.]+$/.test(preview.hostname)||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bind))throw Error('需要有效的隔离HTTPS预览配置');
const prefix='preview_'+task.replaceAll('-','_');
const schemas={catalog:prefix+'_catalog',accounts:prefix+'_accounts',resources:prefix+'_resources'};
const index=prefix+'_works';
if(process.platform!=='linux'||hostname()!==process.env.WG_UI_UX_HOSTNAME||!process.env.TMUX||process.env.WG_UI_UX_ROOT!==root)throw Error('仅允许本任务远程持久化目录');
const database=process.env.WVN_TEST_DATABASE_URL!;
const target=new URL(database);
if(target.username!=='wvn_qa'||target.pathname!=='/wvn_qa'||target.port!=='25439'||!['127.0.0.1','localhost'].includes(target.hostname))throw Error('拒绝使用业务数据库');
// 索引与会话写入也必须落在专用 QA 服务，校验先于任何 schema/index 创建。
for(const [name,port,protocols] of [['MEILISEARCH_URL','27739',['http:','https:']],['REDIS_URL','26389',['redis:','rediss:']]] as const){
 let dependency:URL;
 try{dependency=new URL(process.env[name]??'')}catch{throw Error(`缺少或无效的专用QA配置：${name}`)}
 if(!['127.0.0.1','localhost'].includes(dependency.hostname)||dependency.port!==port||!(protocols as readonly string[]).includes(dependency.protocol))throw Error(`拒绝使用专用QA范围之外的服务：${name}`);
}
async function exists(path:string){return stat(path).then(()=>true,()=>false)}
async function prepare(){
 await mkdir(privateDir,{recursive:true,mode:0o700});
 const marker=join(privateDir,'owner.json');
 const owns=await exists(marker);
 if(owns){const previous=JSON.parse(await readFile(marker,'utf8'));if(previous.root!==root||previous.task!==task)throw Error('预览目录归属不符')}
 const pool=new Pool({connectionString:database,max:1});
 try{
  for(const schema of Object.values(schemas)){
   const old=await pool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name=$1',[schema]);
   if(old.rowCount&&!owns)throw Error('同名schema已存在但无本任务归属证明');
   if(!old.rowCount)await pool.query(`CREATE SCHEMA "${schema}"`);
  }
 }finally{await pool.end()}
 await writeFile(marker,JSON.stringify({task,root,schemas,index,origin}),{mode:0o600});
 const store=new Store(new PgDatabase(database,{schema:schemas.catalog}));
 try{
  await store.seed(JSON.parse(await readFile('data/catalog.json','utf8')));
  await store.importMetadata(JSON.parse(await readFile('data/metadata.json','utf8')),true);
  await store.classifications.import(JSON.parse(await readFile('data/content-classification.json','utf8')));
  const meili=new MeiliClient({url:process.env.MEILISEARCH_URL!,apiKey:process.env.MEILI_MASTER_KEY!});
  await meili.ensureIndex(index);await meili.settings(index);
  await meili.replace(index,await documents(store.database,(await store.list()).map(w=>w.id)));
 }finally{await store.close()}
 const tlsKey=join(privateDir,'tls.key'),tlsCert=join(privateDir,'tls.crt'),secret=join(privateDir,'secret');
 if(!await exists(tlsKey))execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tlsKey,'-out',tlsCert,'-days','30','-subj','/CN='+preview.hostname,'-addext','subjectAltName=DNS:localhost,DNS:'+preview.hostname+',IP:'+bind],{stdio:'ignore'});
 if(!await exists(secret))await writeFile(secret,randomBytes(48).toString('hex'),{mode:0o600});
 let media=join(root,'media');
 const mediaSource=process.env.WG_UI_UX_MEDIA_SOURCE;
 if(mediaSource&&await exists(mediaSource))media=mediaSource;
 else if(!await exists(media))await mkdir(media,{recursive:true});
 const env={...process.env};for(const name of Object.keys(env))if(name.startsWith('WG_'))delete env[name];
 Object.assign(env,{
  WG_DATABASE_URL:database,WG_DATABASE_SCHEMA:schemas.catalog,
  WG_ACCOUNT_DATABASE_URL:database,WG_ACCOUNT_DATABASE_SCHEMA:schemas.accounts,
  WG_RESOURCE_DATABASE_URL:database,WG_RESOURCE_DATABASE_SCHEMA:schemas.resources,
  WG_ACCOUNT_ORIGIN:origin,WG_ACCOUNT_BIND:bind,WG_ACCOUNT_PORT:String(port),WG_ACCOUNT_UI:'1',WG_ACCOUNT_COOKIE_PREFIX:task==='ios-reader-auth-20261114'?'__Host-wg-ios-reader-auth-20261114':task==='m3-20261114'?'__Host-wg-m3-20261114':task==='dashboard-20261114'?'__Host-wg-dashboard-20261114':task==='dashboard-release-20261114'?'__Host-wg-dashboard-release-20261114':'__Host-wg-ui-ux-preview',
  WG_ACCOUNT_SECRET_FILE:secret,WG_ACCOUNT_DELETION_LEDGER:join(privateDir,'deletions.jsonl'),WG_ACCOUNT_BLOBS:join(privateDir,'blobs'),WG_ACCOUNT_SHARE_LEDGER:join(privateDir,'shares.jsonl'),
  WG_SHARE_ADMIN_ORIGIN:`https://localhost:${port+2}`,WG_SHARE_ADMIN_PORT:String(port+2),WG_SHARE_ADMIN_TOKEN_FILE:join(privateDir,'share-admin-token'),
  WG_ACCOUNT_TLS_KEY:tlsKey,WG_ACCOUNT_TLS_CERT:tlsCert,WG_CONTENT_GATE:'1',WG_ALL_ENGINES:'1',WG_ONS_PILOT:'1',WG_ONS_CLOUD:'1',WG_MEDIA_ROOT:media,
  WG_SHARE_BACKEND_ORIGIN:origin,WG_SHARE_ACCOUNT_ORIGIN:origin,
  WG_RESOURCE_ROOT:join(privateDir,'empty-games'),WG_PLAYER_MEDIA_ROOT:join(privateDir,'empty-games'),WG_DEPLOYMENT_MODE:'preview',MEILI_INDEX_UID:index,WG_STATE_DIR:join(privateDir,'state'),
  NODE_USE_ENV_PROXY:'1',WG_PREVIEW_CAS_MANIFEST_ORIGIN:'https://wg.saop.cc',WG_PREVIEW_CAS_MANIFEST_DIRECTORY:join(privateDir,'manifests'),
 });
 if(['dashboard-20261114','dashboard-release-20261114'].includes(task)&&await exists(join(privateDir,'admin-ids')))env.WG_ADMIN_USER_IDS=(await readFile(join(privateDir,'admin-ids'),'utf8')).trim();
 if(process.env.WG_UI_UX_CACHE_ORIGIN){
  const cache=new URL(process.env.WG_UI_UX_CACHE_ORIGIN);
  if(task!=='ios-reader-auth-20261114'||cache.origin!=='https://localhost:25286')throw Error('拒绝未知的缓存预览来源');
  env.WG_RESOURCE_CACHE_ORIGIN=cache.origin;
 }
 const control=process.env.WG_UI_UX_CONTROL_SOURCE;
 if(control&&await exists(control)){
  const ownedControl=join(privateDir,'control.json');execFileSync('rsync',['-a',control,ownedControl]);env.WG_B2_CONTROL_FILE=ownedControl;
 }
 await mkdir(env.WG_RESOURCE_ROOT!,{recursive:true});
 return {env,tlsCert};
}
async function healthy(){
 return new Promise<boolean>(yes=>{
  const call=request(origin+'/health',{rejectUnauthorized:false,timeout:3000},response=>{response.resume();yes(response.statusCode===200)});
  call.on('error',()=>yes(false));call.on('timeout',()=>{call.destroy();yes(false)});call.end();
 });
}
async function run(command:string,args:string[],env:NodeJS.ProcessEnv){
 const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});
 process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));
 return new Promise<number>(yes=>{child.on('exit',code=>yes(code??1));child.on('error',()=>yes(1))});
}
const mode=process.argv[2];
if(mode==='serve'){
 if(await healthy())throw Error('预览端口已有服务；先检查原任务，拒绝重复启动');
 const {env}=await prepare();
 Object.assign(process.env,env);
 const catalog=new Store(new PgDatabase(database,{schema:schemas.catalog}));await catalog.ready;
 const auth=new Auth();await writeFile(join(privateDir,'catalog-admin-token'),auth.token,{mode:0o600});
 const admin=createAdminApp(catalog,auth,JSON.parse(await readFile('data/sources.json','utf8')));
 const built=await import(resolve(root,'build/server/index.js'));
 const render=createRequestHandler(built,'production');
 admin.get('/assets/*',c=>fileResponse(c.req.raw,resolve(root,'build/client'),c.req.path));
 admin.all('*',c=>render(c.req.raw,new RouterContextProvider()));
 const adminServer=serve({fetch:admin.fetch,hostname:'127.0.0.1',port:port+1,createServer,serverOptions:{key:await readFile(join(privateDir,'tls.key')),cert:await readFile(join(privateDir,'tls.crt'))}});
 await writeFile(join(privateDir,'preview-process.json'),JSON.stringify({root,pid:process.pid,origin,admin:`https://localhost:${port+1}`,startedAt:new Date().toISOString()}),{mode:0o600});
 console.log(JSON.stringify({任务:task,预览:origin,schemas,index}));
 try{process.exitCode=await run(process.execPath,['--import','tsx','accounts-server.ts'],env)}finally{await new Promise<void>(yes=>adminServer.close(()=>yes()));await catalog.close()}
}else if(mode==='verify'||mode==='red'){
 if(!await healthy())throw Error('本任务HTTPS预览尚未运行');
 const env={...process.env,WG_UI_UX_TEST_URL:origin,WG_CONTENT_TEST_URL:origin,WG_ACCOUNT_TEST_URL:origin,WG_ACCOUNT_TEST_CERT:join(privateDir,'tls.crt'),WG_TEST_URL:origin};
 const native=process.env.WG_CONTENT_NATIVE_CAS==='1';
 const args=['playwright','test','tests/e2e/content.spec.ts',...(mode==='verify'?['tests/e2e/content-boundaries.spec.ts',...(native?['tests/e2e/content-cas-native.spec.ts']:[])]:[]),'--output='+join(base,'reports',native?'browser-cas-native':'browser')];
 if(mode==='red'||process.env.WG_CONTENT_TEST_GREP)args.push('--grep',process.env.WG_CONTENT_TEST_GREP||'游客只得到');
 process.exitCode=await run('npx',args,env);
}else throw Error('需要serve/verify/red');
