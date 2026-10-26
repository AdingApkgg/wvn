import type { TestContext } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, sep } from 'node:path';
// 备份/分享单元测试只在自己的临时夹具目录模拟空间，不依赖验收主机容量。
export function fixtureDiskSpace(t: TestContext, directory: string) {
 const root=resolve(directory), original=fs.statfsSync;
 t.mock.method(fs,'statfsSync',((path: fs.PathLike, options?: {bigint?:boolean})=>{
  const actual=original(path,options as any), name=resolve(String(path));
  if(name!==root&&!name.startsWith(root+sep))return actual;
  return {...actual,bavail:typeof actual.bsize==='bigint'?1024n**4n/actual.bsize:1024**4/actual.bsize};
 }) as typeof fs.statfsSync);
 syncBuiltinESMExports();
 t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports()});
}
