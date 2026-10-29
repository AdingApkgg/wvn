import importlib.util
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
        r={k:meta[k] for k in ('namespace','bucket','frozen_sha256','inventory_sha256')};r.update(plan_sha256=m.digest(self.p),accepted=True,worker_revision='worker',api_revision='api',issued_by='root',gates={k:True for k in ('api','worker','browser','cas_uncached','range','reentry')})
        file=self.root/'receipt.json';file.write_text(json.dumps(r));return file
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
