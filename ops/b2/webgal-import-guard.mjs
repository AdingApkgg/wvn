import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// 生产入口必须显式选择，并绑定已验收导入计划的完整摘要。
export function webgalImportRun(args,env,planBytes){
 let apply=false,production=false,expected;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--apply'&&!apply)apply=true;
  else if(args[i]==='--production'&&!production)production=true;
  else if(args[i]==='--plan-sha256'&&expected===undefined)expected=args[++i];
  else throw Error('Usage: import-webgal.ts [--apply] [--production --plan-sha256 SHA256]');
 }
 const catalogSchema=env.WG_DATABASE_SCHEMA,resourceSchema=env.WG_RESOURCE_DATABASE_SCHEMA;
 assert(catalogSchema&&resourceSchema,'Explicit database schemas required');
 if(production){
  assert.equal(env.WG_DEPLOYMENT_MODE,'production');assert.equal(catalogSchema,'catalog');assert.equal(resourceSchema,'resources');
  assert(typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected),'Production plan digest required');
  assert.equal(createHash('sha256').update(planBytes).digest('hex'),expected,'Production plan digest differs');
 }else{
  assert.equal(env.WG_DEPLOYMENT_MODE,'preview');assert.equal(expected,undefined);
  assert(catalogSchema.startsWith('webgal_')&&resourceSchema.startsWith('webgal_'),'Explicit isolated WebGAL schemas required');
 }
 return {apply,production,catalogSchema,resourceSchema};
}
