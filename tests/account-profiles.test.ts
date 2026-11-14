import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareHttpFixture } from './helpers/share-http.ts';
import { migrate } from '../src/database/migrations.ts';
import { profileMigrations } from '../src/database/profiles.ts';
import { deleteAccountRows } from '../src/accounts/deletion.server.ts';

test('public numeric UIDs are stable, private by default, and profile updates are revision guarded', async () => {
  const f = await shareHttpFixture();
  try {
    const cookie = await f.register('Reader');
    const me = await (await f.api('/api/me', cookie)).json();
    assert.equal(me.admin, false);
    assert.match(me.user.uid, /^[1-9]\d*$/);
    const path = '/api/public/users/' + me.user.uid;
    assert.equal((await f.api(path)).status, 404);
    const own = await (await f.api('/api/me/profile', cookie)).json();
    assert.equal(own.published, false);
    const update = (body: unknown, binding = me.binding) => f.service.app.request('https://accounts.wg.test/api/me/profile', {
      method: 'PATCH', headers: { origin: 'https://accounts.wg.test', cookie, 'content-type': 'application/json', 'x-wg-binding': binding }, body: JSON.stringify(body),
    });
    assert.equal((await update({name:'Reader',bio:'hello',published:true,revision:own.revision}, 'wrong')).status, 409);
    const published = await update({name:'新昵称',bio:'<script>plain text</script>',published:true,revision:own.revision});
    assert.equal(published.status, 200);
    assert.equal((await update({name:'stale',bio:'',published:false,revision:own.revision})).status,409);
    const page = await (await f.api(path)).json();
    assert.deepEqual(Object.keys(page).sort(), ['uid','name','bio','joinedAt'].sort());
    assert.equal(page.name, '新昵称');
    assert.equal((await (await f.api('/api/me',cookie)).json()).user.name,'新昵称');
    assert.match((await f.api(path)).headers.get('cache-control')!, /no-store/);
    await migrate(f.service.db, profileMigrations);
    assert.equal((await (await f.api('/api/me/profile',cookie)).json()).uid,own.uid);
    assert.equal((await update({...await published.json(),name:'Reader',bio:'',published:false})).status,400);
    const current = await (await f.api('/api/me/profile',cookie)).json();
    assert.equal((await update({name:'Reader',bio:'',published:false,revision:current.revision})).status,200);
    assert.equal((await f.api(path)).status,404);
    assert.equal((await f.api('/api/public/users/01')).status,404);
    assert.equal((await f.api('/api/public/users/999999999999999999999')).status,404);
    const second = await f.register('Second');
    const next = await (await f.api('/api/me',second)).json();
    assert.ok(BigInt(next.user.uid) > BigInt(me.user.uid));
    await deleteAccountRows(f.service.db, f.service.saves, me.user.id, Date.now());
    assert.equal((await f.api(path)).status,404);
    const third = await f.register('Third');
    assert.ok(BigInt((await (await f.api('/api/me',third)).json()).user.uid) > BigInt(next.user.uid));
  } finally { await f.close(); }
});

test('existing accounts receive deterministic UIDs and concurrent inserts allocate unique non-reused numbers',async()=>{
  const {postgresFixture}=await import('./helpers/postgres.ts');
  const {makeAuth}=await import('../src/accounts/auth.server.ts');
  const {getMigrations}=await import('better-auth/db/migration');
  const f=await postgresFixture();
  try {
    const auth=makeAuth(f.db,{origin:'https://accounts.wg.test',database:process.env.WVN_TEST_DATABASE_URL!,secret:'synthetic-profile-migration-secret-with-at-least-48-characters'});
    await(await getMigrations(auth.options)).runMigrations();
    for(const [id,time] of [['z','2025-01-01'],['b','2026-01-01'],['a','2026-01-01']])
      await f.db.prepare('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,false,$3,$3)').run(id,id+'@example.invalid',new Date(time));
    await migrate(f.db,profileMigrations);
    assert.deepEqual((await f.db.prepare('SELECT user_id FROM wg_public_profiles ORDER BY uid').all()).map(r=>r.user_id),['z','a','b']);
    await Promise.all(Array.from({length:10},(_,i)=>f.db.prepare('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,false,now(),now())').run('new'+i,'new'+i+'@example.invalid')));
    assert.equal(Number((await f.db.prepare('SELECT count(DISTINCT uid) AS n FROM wg_public_profiles').get())!.n),13);
    await f.db.prepare('DELETE FROM "user" WHERE id=$1').run('a');
    await migrate(f.db,profileMigrations);
    assert.equal((await f.db.prepare('SELECT uid FROM wg_public_profiles WHERE user_id=$1').get('b'))!.uid,3);
  }finally{await f.close()}
});

test('profile lists include only approved public shares and remove revoked or unpublished items',async()=>{
  const {createHash}=await import('node:crypto');
  const f=await shareHttpFixture();
  try{
    const cookie=await f.register('Share author');
    const me=await(await f.api('/api/me',cookie)).json();
    await f.service.profiles.update(me.user.id,{name:'Share author',bio:'',published:true,revision:0});
    const path='/api/public/users/'+me.user.uid+'/save-shares';
    const saves=f.service.saves!,sharing=f.service.sharing!;
    const profile=await saves.createProfile(me.user.id,'version-a');
    const bytes=Buffer.from('profile share test');
    const upload=await saves.reserve(me.user.id,profile.id,{expectedHead:null,generation:1,captureId:'profile-test',files:[{name:'slot.dat',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]});
    await saves.write(me.user.id,upload.id,upload.files[0].id,new Blob([bytes]).stream());
    const revision=(await saves.commit(me.user.id,upload.id)).revision;
    await sharing.catalog.refresh(true);
    const input={profileId:profile.id,generation:1,revisionId:revision.id,title:'Author share',description:'',progress:'chapter' as const,spoiler:false,days:30};
    const published=await sharing.create(me.user.id,{...input,mode:'public',requestId:'public-profile'});
    assert.deepEqual((await(await f.api(path)).json()).items,[]);
    await sharing.moderate(published.id,1,'approve','公开主页测试');
    await sharing.create(me.user.id,{...input,mode:'link',requestId:'link-profile'});
    const list=await(await f.api(path)).json();
    assert.deepEqual(list.items.map((s:any)=>s.id),[published.id]);
    await sharing.revoke(me.user.id,published.id);
    assert.deepEqual((await(await f.api(path)).json()).items,[]);
    await f.service.profiles.update(me.user.id,{name:'Share author',bio:'',published:false,revision:1});
    assert.equal((await f.api(path)).status,404);
  }finally{await f.close()}
});
