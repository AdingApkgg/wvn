import {fixtureDiskSpace} from "./helpers/disk-space.ts";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PgDatabase } from '../src/database/postgres.ts';
import { applyAccountRestore } from '../src/accounts/backup.server.ts';
import { restoreDatabase } from './helpers/backup.ts';
import { createAccountService } from './helpers/accounts.ts';
import { prepareSplitBackup, finalizeSplitBackup } from '../src/accounts/split-backup.server.ts';
test('split backup reunites metadata and Windows blobs and verifies restored history, shares and secret', async (t) => {
 mkdirSync('state',{recursive:true}); const root=mkdtempSync(join(process.cwd(),'state','wg-split-backup-'));
 fixtureDiskSpace(t,root);
 const config={origin:'https://localhost',secret:'s'.repeat(64),database:join(root,'live.sqlite'),blobRoot:join(root,'blobs'),deletionLedger:join(root,'deleted.jsonl'),shareLedger:join(root,'revoked.jsonl'),catalogProvider:async()=>[{id:'v4',title:'Story',url:'/4/',versions:[{id:'version-a',title:'Version',number:1,engine:'ONS',url:'/4/1/'}]}]};
 const service=await createAccountService(config), target=await restoreDatabase();
 try {
  const user=await(await service.auth.$context).internalAdapter.createUser({name:'Backup fixture',email:'fixture@placeholder.invalid',emailVerified:false},{method:'passkey'});
  const p=(await service.saves!.createProfile(user.id,'version-a')), bytes=Buffer.from('split backup bytes'), hash=createHash('sha256').update(bytes).digest('hex');
  const u=await service.saves!.reserve(user.id,p.id,{expectedHead:null,generation:1,captureId:'first',files:[{name:'save.dat',bytes:bytes.length,sha256:hash}]});
  await service.saves!.write(user.id,u.id,u.files[0].id,new Blob([bytes]).stream()); const first=await service.saves!.commit(user.id,u.id); const second=await service.saves!.restore(user.id,p.id,first.revision.id,first.revision.id,1);
  await service.sharing!.catalog.refresh(true); await service.sharing!.create(user.id,{profileId:p.id,generation:1,revisionId:second.id,mode:'link',days:1,requestId:'backup-share',title:'Fixture',description:'',progress:'chapter',spoiler:false});
  writeFileSync(join(root,'secret'),config.secret,{mode:0o600});
  await prepareSplitBackup({database:service.config.database,databaseSchema:service.config.databaseSchema,secret:join(root,'secret'),ledger:config.deletionLedger,shareLedger:config.shareLedger,destination:join(root,'stage')});
  const result=await finalizeSplitBackup({stage:join(root,'stage'),blobRoot:config.blobRoot,destination:join(root,'backup'),restoreDirectory:join(root,'restore')});
  assert.equal(result.status,'files-verified-restore-prepared');assert.equal(result.databaseRestored,false);assert.equal(result.files,1);assert.equal(result.counts.wg_save_revisions,2);assert.equal(result.counts.wg_save_shares,1);
  assert.equal(readFileSync(join(root,'backup','secret'),'utf8'),config.secret);
  assert.equal(statSync(join(root,'backup','secret')).mode & 0o777,0o600);
  const restored=await applyAccountRestore({prepared:join(root,'restore'),database:target.database});
  const db=new PgDatabase(target.database,{schema:restored.databaseSchema});try{assert.equal((await db.prepare('SELECT count(*) n FROM wg_save_revisions').get())?.n,2)}finally{await db.close()}
  writeFileSync(join(root,'stage','secret'),'tampered');await assert.rejects(()=>finalizeSplitBackup({stage:join(root,'stage'),blobRoot:config.blobRoot,destination:join(root,'bad-backup'),restoreDirectory:join(root,'bad-restore')}),/hash/);
 } finally {(await service.close());await target.close();rmSync(root,{recursive:true,force:true})}
});
