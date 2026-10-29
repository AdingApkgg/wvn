import importlib.util
from contextlib import contextmanager
import subprocess
import sys
import time
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('cleanup', Path(__file__).parents[1] / 'scripts/migration/b2-cas-cleanup.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.f = self.root/'f.db'; self.i = self.root/'i.db'; self.e = self.root/'e.json'; self.p = self.root/'p.db'
        self.sha = 'a'*64
        c = sqlite3.connect(self.f)
        c.executescript('CREATE TABLE resource_objects(sha256 TEXT,bytes INTEGER);CREATE TABLE b2_cas_sources(namespace TEXT,original_path TEXT,source_file_id TEXT,sha256 TEXT,status TEXT);CREATE TABLE b2_cas_locations(sha256 TEXT,file_id TEXT,content_sha1 TEXT);CREATE TABLE b2_cas_snapshots(namespace TEXT,inventory_sha256 TEXT);')
        c.execute('INSERT INTO resource_objects VALUES(?,3)',(self.sha,)); c.execute('INSERT INTO b2_cas_sources VALUES(?,?,?,?,?)',(m.NAMESPACE,'game/a','source',self.sha,'verified'));c.execute('INSERT INTO b2_cas_locations VALUES(?,?,?)',(self.sha,'target','b'*40));c.execute('INSERT INTO b2_cas_snapshots VALUES(?,?)',(m.NAMESPACE,'snapshot'));c.commit();c.close()
        c = sqlite3.connect(self.i);c.executescript('CREATE TABLE versions(file_id TEXT PRIMARY KEY,name TEXT,action TEXT,bytes INTEGER,sha1 TEXT,metadata_sha256 TEXT,uploaded_ms INTEGER,is_cas INTEGER,sse_c INTEGER,retention TEXT,legal_hold TEXT);CREATE TABLE meta(key TEXT,value TEXT);INSERT INTO meta VALUES("complete","1");CREATE INDEX names ON versions(name);')
        for fid,name,cas in [('source','game/a',0),('target',self.sha+'.bin',1)]:c.execute('INSERT INTO versions VALUES(?,?,?,?,?,?,?,?,?,?,?)',(fid,name,'upload',3,'b'*40,None,1,cas,0,'null','null'))
        c.commit();c.close();self.e.write_text(json.dumps({'bucketFileLockConfiguration':{'isClientAuthorizedToRead':True,'value':{'isFileLockEnabled':False}},'extras':[]}))
    def build(self): return m.build(self.f,self.i,self.e,self.p)
    def mutate(self, sql):
        c=sqlite3.connect(self.i);c.execute(sql);c.commit();c.close()
    def receipt(self):
        p=m.ro(self.p);meta=dict(p.execute('SELECT key,value FROM meta'));p.close()
        r={k:meta[k] for k in ('namespace','bucket','frozen_sha256','inventory_sha256','enrichment_sha256')};r.update(plan_sha256=m.digest(self.p),accepted=True,delivery_mode='browser-direct-cas',worker_free=True,api_revision='api',client_revision='client',cf_config_sha256='c'*64,issued_by='test-only',gates={k:True for k in ('api','no_worker','browser','cas_uncached','range','reentry','mime','cors')})
        file=self.root/'receipt.json';file.write_text(json.dumps(r));return file
    def duplicate(self):
        self.mutate("INSERT INTO versions SELECT 'duplicate',name,action,bytes,sha1,metadata_sha256,0,is_cas,sse_c,retention,legal_hold FROM versions WHERE file_id='target'")
        return {'fileId':'duplicate','name':self.sha+'.bin','bytes':3,'sha256':self.sha,'sha1':'b'*40,'target':{'file_id':'target','bytes':3,'content_sha1':'b'*40}}
    def enrich_duplicate(self, proofs):
        d=json.loads(self.e.read_text());d['preservedCasDuplicates']=proofs;self.e.write_text(json.dumps(d))
    def test_no_worker_receipt(self):
        self.build();r=self.receipt();self.assertEqual(m.receipt_check(self.p,r,m.digest(r))['count'],'1')
    def test_invalid_receipts_before_client(self):
        self.build();r=self.receipt();base=json.loads(r.read_text());calls=[]
        invalid=[]
        old=dict(base);old.update(worker_revision='legacy',worker_free=False);invalid.append(old)
        for key in ('delivery_mode','worker_free','api_revision','client_revision','issued_by','cf_config_sha256','enrichment_sha256','plan_sha256','inventory_sha256','frozen_sha256'):
            d=json.loads(json.dumps(base));d.pop(key);invalid.append(d)
        for key in base['gates']:
            d=json.loads(json.dumps(base));d['gates'][key]=False;invalid.append(d)
        for value in ('C'*64,'bad',''):
            d=dict(base);d['cf_config_sha256']=value;invalid.append(d)
        for d in invalid:
            with self.subTest(receipt=d):
                r.write_text(json.dumps(d))
                with self.assertRaises(ValueError):m.execute(self.p,self.root/'invalid.db',r,m.digest(r),lambda:calls.append('client'))
        self.assertEqual(calls,[]);self.assertFalse((self.root/'invalid.db').exists())
    def test_duplicate_preserved(self):
        self.enrich_duplicate([self.duplicate()]);result=self.build()
        self.assertEqual(result['count'],'1');self.assertEqual(result['blockers'],'0');self.assertEqual(result['preserved_cas_duplicates'],'1')
        with m.ro(self.p) as c:
            self.assertEqual(c.execute('SELECT file_id FROM preserved_cas_duplicates').fetchone()[0],'duplicate')
            self.assertEqual(c.execute('SELECT count(*) FROM candidates WHERE name LIKE "%.bin"').fetchone()[0],0)
    def test_duplicate_without_proof(self):
        self.duplicate();self.assertEqual(self.build()['blockers'],'1')
    def test_duplicate_bad_proofs(self):
        proof=self.duplicate();variants=[]
        for key in proof:
            d=json.loads(json.dumps(proof));d.pop(key);variants.append([d])
        for key,value in [('fileId','missing'),('name','other'),('bytes',4),('sha256','d'*64),('sha1','d'*40)]:
            d=json.loads(json.dumps(proof));d[key]=value;variants.append([d])
        for key,value in [('file_id','wrong'),('bytes',4),('content_sha1','d'*40)]:
            d=json.loads(json.dumps(proof));d['target'][key]=value;variants.append([d])
        variants.append([proof,proof])
        for proofs in variants:
            with self.subTest(proofs=proofs):
                self.enrich_duplicate(proofs)
                with self.assertRaises(ValueError):self.build()
                self.assertFalse(self.p.exists())
    def test_duplicate_newer_still_rejected(self):
        self.enrich_duplicate([self.duplicate()]);self.mutate("UPDATE versions SET uploaded_ms=2 WHERE file_id='duplicate'")
        with self.assertRaises(ValueError):self.build()
    def test_duplicate_inventory_identity_changed(self):
        self.enrich_duplicate([self.duplicate()])
        for column,value in [('name','other'),('bytes',4),('sha1','d'*40),('action','hide')]:
            with self.subTest(column=column):
                c=sqlite3.connect(self.i);old=c.execute('SELECT '+column+' FROM versions WHERE file_id=?',('duplicate',)).fetchone()[0]
                c.execute('UPDATE versions SET '+column+'=? WHERE file_id=?',(value,'duplicate'));c.commit();c.close()
                with self.assertRaises(ValueError):self.build()
                c=sqlite3.connect(self.i);c.execute('UPDATE versions SET '+column+'=? WHERE file_id=?',(old,'duplicate'));c.commit();c.close()
    def test_receipt_binding_tamper(self):
        self.build();r=self.receipt();base=json.loads(r.read_text())
        for key in ('enrichment_sha256','plan_sha256','inventory_sha256','frozen_sha256','namespace','bucket'):
            with self.subTest(key=key):
                d=dict(base);d[key]='forged';r.write_text(json.dumps(d))
                with self.assertRaises(ValueError):m.receipt_check(self.p,r,m.digest(r))
    def test_duplicate_target_proof_unused(self):
        d=self.duplicate();d['fileId']='target';self.enrich_duplicate([d])
        with self.assertRaises(ValueError):self.build()
    def test_good(self):
        self.assertEqual(self.build()['count'],'1')
    def test_mismatch(self):
        self.mutate("UPDATE versions SET name='other' WHERE file_id='source'");self.assertEqual(self.build()['blockers'],'1')
    def test_source_sha1_changed(self):
        self.mutate("UPDATE versions SET sha1='cccccccccccccccccccccccccccccccccccccccc' WHERE file_id='source'")
        self.assertEqual(self.build()['blockers'],'1')
    def test_limit_zero_sends_nothing(self):
        self.build();r=self.receipt()
        self.assertEqual(m.execute(self.p,self.root/'c.db',r,m.digest(r),object(),batch_size=10,limit=0)['done'],0)
    def test_target_missing(self):
        self.mutate("DELETE FROM versions WHERE file_id='target'")
        with self.assertRaises(ValueError):self.build()
    def test_target_changed(self):
        self.mutate("UPDATE versions SET bytes=4 WHERE file_id='target'")
        with self.assertRaises(ValueError):self.build()
    def test_target_latest(self):
        self.mutate("INSERT INTO versions SELECT 'new',name,action,bytes,sha1,metadata_sha256,2,is_cas,sse_c,retention,legal_hold FROM versions WHERE file_id='target'")
        with self.assertRaises(ValueError):self.build()
    def test_unknown_and_forged_extra(self):
        self.mutate("INSERT INTO versions SELECT 'forged',name,action,bytes,sha1,metadata_sha256,0,is_cas,sse_c,retention,legal_hold FROM versions WHERE file_id='source'")
        self.assertEqual(self.build()['blockers'],'1')
    def test_unauthorized_lock_is_blocker(self):
        self.e.write_text(json.dumps({'bucketFileLockConfiguration':{'isClientAuthorizedToRead':False,'value':None}}));self.assertEqual(self.build()['blockers'],'1')
    def test_explicit_server_lock_policy(self):
        self.e.write_text(json.dumps({'bucketFileLockConfiguration':{'isClientAuthorizedToRead':False,'value':None}}))
        result=m.build(self.f,self.i,self.e,self.p,True)
        self.assertEqual(result['count'],'1');self.assertEqual(result['unknown_lock_versions'],'1')
    def test_server_policy_never_bypasses_known_hold(self):
        self.mutate('UPDATE versions SET legal_hold=\'{"value":"on","isClientAuthorizedToRead":true}\' WHERE file_id="source"')
        self.assertEqual(m.build(self.f,self.i,self.e,self.p,True)['blockers'],'1')
    def test_extra_proof_and_tampered_sha(self):
        self.mutate("INSERT INTO versions SELECT 'old',name,action,bytes,sha1,metadata_sha256,0,is_cas,sse_c,retention,legal_hold FROM versions WHERE file_id='source'")
        d=json.loads(self.e.read_text());d['extras']=[{'fileId':'old','name':'game/a','bytes':3,'sha256':'c'*64,'sha1':'b'*40,'target':{'file_id':'target','content_sha1':'b'*40,'bytes':3},'currentSource':{'source_file_id':'source','sha256':self.sha}}];self.e.write_text(json.dumps(d))
        self.assertEqual(self.build()['blockers'],'1')
    def test_locked_source(self):
        self.mutate('UPDATE versions SET legal_hold=\'{"value":"on","isClientAuthorizedToRead":true}\' WHERE file_id="source"');self.assertEqual(self.build()['blockers'],'1')
    def test_receipt_before_delete(self):
        self.build();r=self.receipt()
        with self.assertRaises(ValueError):m.execute(self.p,self.root/'c.db',r,'bad',object())
        self.assertFalse((self.root/'c.db').exists())
    def test_batch_exact_and_partial(self):
        self.build();r=self.receipt();outer=self
        class Fake:
            def delete_objects(self,**kw):
                outer.assertEqual(kw,{'Bucket':m.BUCKET,'Delete':{'Objects':[{'Key':'game/a','VersionId':'source'}],'Quiet':False}})
                return {'Errors':[{'Key':'game/a','VersionId':'source','Code':'InternalError'}]}
            def present(self,fid):return False
        with self.assertRaises(ValueError):m.execute(self.p,self.root/'c.db',r,m.digest(r),Fake())
        self.assertEqual(m.execute(self.p,self.root/'c.db',r,m.digest(r),Fake())['done'],1)
    def test_ambiguous_remains_pending(self):
        self.build();r=self.receipt()
        class Fake:
            def delete_objects(self,**kw):raise TimeoutError('secret must not print')
            def present(self,fid):return None
        with self.assertRaises(ValueError):m.execute(self.p,self.root/'c.db',r,m.digest(r),Fake())
        c=sqlite3.connect(self.root/'c.db');self.assertEqual(c.execute('SELECT count(*) FROM pending').fetchone()[0],1);c.close()
        class Recovery:
            def present(self,fid):return False
            def delete_objects(self,**kw):raise AssertionError('已消失版本不能再删除')
        self.assertEqual(m.execute(self.p,self.root/'c.db',r,m.digest(r),Recovery())['done'],1)
    def test_small_batch_limit_and_resume(self):
        self.build();self.p.chmod(0o600);c=sqlite3.connect(self.p)
        c.execute("INSERT INTO candidates(file_id,name,bytes,sha256,target_id,target_sha1) SELECT 'second',name,bytes,sha256,target_id,target_sha1 FROM candidates LIMIT 1")
        c.execute("UPDATE meta SET value='2' WHERE key='count'");c.commit();c.close();self.p.chmod(0o400);r=self.receipt();calls=[]
        class Fake:
            def delete_objects(self,**kw):
                calls.append(kw);return {'Deleted':kw['Delete']['Objects']}
            def present(self,fid):raise AssertionError('成功批次不应逐项查询')
        self.assertEqual(m.execute(self.p,self.root/'c.db',r,m.digest(r),Fake(),1,1)['done'],1)
        self.assertEqual(m.execute(self.p,self.root/'c.db',r,m.digest(r),Fake(),1,1)['done'],2)
        self.assertEqual([c['Delete']['Objects'][0]['VersionId'] for c in calls],['source','second'])
    @contextmanager
    def inflight_apply(self):
        self.build();r=self.receipt();checkpoint=self.root/'exclusive.db'
        entered=self.root/'entered';release=self.root/'release'
        code = """
import importlib.util,json,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('cleanup',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
plan,checkpoint,receipt,entered,release=map(Path,sys.argv[2:])
class Fake:
 def delete_objects(self,**kw):
  entered.write_text('request in flight')
  deadline=time.monotonic()+10
  while not release.exists():
   if time.monotonic()>deadline:raise RuntimeError('test timeout')
   time.sleep(.01)
  return {'Deleted':kw['Delete']['Objects']}
 def present(self,fid):raise AssertionError('normal first request needs no reconcile')
m.execute(plan,checkpoint,receipt,m.digest(receipt),Fake())
"""
        process=subprocess.Popen([sys.executable,'-c',code,str(Path(m.__file__)),str(self.p),str(checkpoint),str(r),str(entered),str(release)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            deadline=time.monotonic()+5
            while not entered.exists():
                if process.poll() is not None or time.monotonic()>deadline:
                    self.fail('first apply did not reach in-flight boundary')
                time.sleep(.01)
            yield checkpoint,r
        finally:
            release.write_text('continue')
            stdout,stderr=process.communicate(timeout=5)
            self.assertEqual(process.returncode,0,(stdout,stderr))
    def test_inflight_same_checkpoint_rejected_before_reconcile(self):
        calls=[]
        class Second:
            def present(self,fid):calls.append('present');return True
            def delete_objects(self,**kw):calls.append('delete');return {'Deleted':kw['Delete']['Objects']}
        with self.inflight_apply() as (checkpoint,r):
            with self.assertRaisesRegex(ValueError,'另一个清理执行器'):
                m.execute(self.p,checkpoint,r,m.digest(r),Second())
            self.assertEqual(calls,[])
            c=sqlite3.connect(checkpoint);self.assertEqual(c.execute('SELECT count(*) FROM pending').fetchone()[0],1);c.close()
        # 首进程正常退出后，锁释放，同一检查点可正常恢复且不重复删除。
        self.assertEqual(m.execute(self.p,checkpoint,r,m.digest(r),Second())['done'],1)
        self.assertEqual(calls,[])
    def test_inflight_same_plan_new_checkpoint_rejected_before_client(self):
        calls=[]
        def factory():calls.append('client');raise AssertionError('second client must not initialize')
        with self.inflight_apply() as (checkpoint,r):
            second=self.root/'second.db';plan_alias=self.root/'plan-alias';plan_alias.symlink_to(self.p)
            with self.assertRaisesRegex(ValueError,'另一个清理执行器'):
                m.execute(plan_alias,second,r,m.digest(r),factory)
            self.assertEqual(calls,[]);self.assertFalse(second.exists())
    def test_inflight_checkpoint_alias_different_plan_rejected(self):
        calls=[]
        def factory():calls.append('client');raise AssertionError('second client must not initialize')
        with self.inflight_apply() as (checkpoint,r):
            alias=self.root/'checkpoint-alias';alias.symlink_to(checkpoint)
            other=self.root/'plan-copy.db';other.write_bytes(self.p.read_bytes())
            with self.assertRaisesRegex(ValueError,'另一个清理执行器'):
                m.execute(other,alias,r,m.digest(r),factory)
            self.assertEqual(calls,[])
    def test_native_http_reconcile_boundary(self):
        class Response:
            status_code=404
            def json(self): return {'code':'file_not_present'}
        class Session:
            def post(self,*args,**kw): return response
        response=Response();client=m.LiveClient.__new__(m.LiveClient);client.session=Session();client.url='https://example.invalid';client.token='private'
        self.assertIs(client.present('source'),False)
        response.status_code=403;self.assertIsNone(client.present('source'))
        response.status_code=200;self.assertIs(client.present('source'),True)
    def test_missing_gate(self):
        self.build();r=self.receipt();d=json.loads(r.read_text());d['gates']['browser']=False;r.write_text(json.dumps(d))
        with self.assertRaises(ValueError):m.receipt_check(self.p,r,m.digest(r))
    def test_cas_never_candidate(self):
        self.build();p=m.ro(self.p);self.assertEqual(p.execute('SELECT name FROM candidates').fetchone()[0],'game/a');p.close()

if __name__=='__main__':unittest.main()
