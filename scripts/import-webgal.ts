import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PgDatabase} from '../src/database/postgres.ts';
import {Store} from '../src/server/store.ts';
import {ResourceRepository} from '../src/resources/repository.ts';
import {VersionResources} from '../src/platform/version-resources.server.ts';
import {webgalPlayers} from '../public/player/webgal-registry.mjs';
import {webgalImportRun} from '../ops/b2/webgal-import-guard.mjs';

// 默认预演只读；已授权生产发布必须显式选择并核对冻结计划摘要。
const planBytes=fs.readFileSync('data/imports/webgal-20261027.json');
const {apply,production,catalogSchema,resourceSchema}=webgalImportRun(process.argv.slice(2),process.env,planBytes);
const plan=JSON.parse(planBytes.toString('utf8'));
assert.equal(plan.entries.length,15);assert.equal(plan.versions.length,15);
const catalog=new Store(new PgDatabase(process.env.WG_DATABASE_URL!,{schema:catalogSchema}));
const db=new PgDatabase(process.env.WG_RESOURCE_DATABASE_URL!,{schema:resourceSchema});
try{
 await catalog.ready;
 const snapshot=await db.prepare('SELECT 1 FROM wvn_resource_snapshots WHERE namespace=$1 AND inventory_sha256=$2 AND published').get(plan.namespace,plan.inventorySha256);
 assert(snapshot,'Verified published snapshot is required');
 const before=await catalog.list(true),existingIds=new Set(before.flatMap(w=>w.versions.map(v=>v.id))),entries=[];
 for(const input of plan.versions){
  const player=webgalPlayers.find(p=>p.versionId===input.id),source=plan.entries.find((e:any)=>e.versionId===input.id);assert(player&&source);
  assert.equal(player.workId,input.workId);assert.equal(player.slot,input.number);
  assert.equal(source.prefix,'imports/webgal.moe/2026-10-27/cdn/'+source.slug+'/');
  const old=await catalog.raw(input.id),work=before.find(w=>w.id===input.workId);
  if(old)for(const key of ['workId','number','legacyPath','engine'] as const)assert.equal(old[key],input[key],'Existing import identity differs');
  else assert.equal(Math.max(...(work?.versions.map(v=>v.number)??[]),0)+1,input.number,'Version slot changed; review before importing');
  const count=await db.prepare('SELECT count(*) AS n FROM wvn_resources WHERE namespace=$1 AND original_path>=$2 COLLATE "C" AND original_path<$3 COLLATE "C"').get(plan.namespace,source.prefix,source.prefix.slice(0,-1)+'0');
  assert(count&&Number(count.n)>0,'Empty import prefix');
  for(const [path,sha]of Object.entries({...player.engineFiles,...player.packageFiles})){
   const row=await db.prepare('SELECT sha256 FROM wvn_resources WHERE namespace=$1 AND original_path=$2').get(plan.namespace,source.prefix+path);assert.equal(row?.sha256,sha,'Registered core resource differs');
  }
  const binding=await db.prepare('SELECT namespace,inventory_sha256,path_prefix FROM wvn_version_resources WHERE version_id=$1').get(input.id);
  if(binding){assert.equal(binding.namespace,plan.namespace);assert.equal(binding.inventory_sha256,plan.inventorySha256);assert.equal(binding.path_prefix,source.prefix,'Existing resource binding differs');}
  entries.push({versionId:input.id,namespace:plan.namespace,inventorySha256:plan.inventorySha256,prefix:source.prefix,resources:Number(count.n),action:old?'unchanged':'add'});
 }
 if(apply){
  await catalog.seed({snapshotAt:new Date().toISOString(),works:plan.works,versions:plan.versions,pending:[]});
  const bridge=new VersionResources(catalog,new ResourceRepository(db));for(const entry of entries)await bridge.bind(entry);
  const after=await catalog.list(true);
  for(const work of before){const next=after.find(w=>w.id===work.id)!;assert.equal(next.defaultVersionId,work.defaultVersionId);assert.deepEqual(next.versions.filter(v=>existingIds.has(v.id)),work.versions);}
 }
 console.log(JSON.stringify({status:apply?'complete':'dry-run',worksAdded:plan.works.filter((w:any)=>!before.some(v=>v.id===w.id)).length,entries,unavailable:plan.unavailable,existingVersionsPreserved:existingIds.size,productionChanged:production&&apply}));
}finally{await catalog.close();await db.close();}
