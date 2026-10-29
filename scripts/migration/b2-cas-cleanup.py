#!/usr/bin/env python3
"""WVN 精确版本清理；默认仅生成不可变计划。"""
import argparse
from contextlib import ExitStack, closing, contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3

BUCKET = 'web-visual-novel'
NAMESPACE = 'b2/web-visual-novel/snapshot-20261028'
CAS = re.compile(r'^[0-9a-f]{64}\.bin$')


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def ro(path):
    c = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    return c


def unlocked(row, bucket_lock):
    if row['sse_c']:
        return False
    retention = json.loads(row['retention'] or 'null')
    hold = json.loads(row['legal_hold'] or 'null')
    # 未授权字段只能由已授权读取的桶级禁用证据补足。
    if bucket_lock is False:
        return not (retention and (retention.get('value') or {}).get('mode')) and not (hold and hold.get('value') == 'on')
    return bool(retention and retention.get('isClientAuthorizedToRead') is True
                and (retention.get('value') or {}).get('mode') is None
                and hold and hold.get('isClientAuthorizedToRead') is True and hold.get('value') == 'off')


def build(frozen, inventory, enrichment, output, allow_server_enforced_lock_check=False):
    output = Path(output)
    if output.exists():
        raise ValueError('计划已存在，拒绝覆盖')
    inv = ro(inventory)
    if dict(inv.execute('SELECT key,value FROM meta')).get('complete') != '1':
        raise ValueError('版本清单未完成')
    inv.execute('ATTACH DATABASE ? AS src', (Path(frozen).resolve().as_uri() + '?mode=ro',))
    inv.execute('CREATE TEMP TABLE sources AS SELECT s.*,o.bytes FROM src.b2_cas_sources s JOIN src.resource_objects o USING(sha256) WHERE namespace=?', (NAMESPACE,))
    inv.execute('CREATE INDEX sources_id ON sources(source_file_id)')
    inv.execute('CREATE INDEX sources_path ON sources(original_path)')
    extra = json.loads(Path(enrichment).read_text())
    lock = extra.get('bucketFileLockConfiguration', {})
    if isinstance(lock, dict) and lock.get('isClientAuthorizedToRead') is True:
        lock_disabled = (lock.get('value') or {}).get('isFileLockEnabled') is False
    else:
        lock_disabled = False
    proofs = {e['fileId']: e for e in extra.get('extras', [])}
    if len(proofs) != len(extra.get('extras', [])):
        raise ValueError('重复历史版本证据')
    multipart = {}
    for e in extra.get('multipartSha1', []):
        v = inv.execute('SELECT * FROM versions WHERE file_id=?', (e['fileId'],)).fetchone()
        if not v or v['name'] != e['name'] or v['bytes'] != e['bytes'] or v['sha1'] != 'none' or e.get('rawSha1') != 'none' or not re.fullmatch('[0-9a-f]{40}', e['sha1']):
            raise ValueError('多段对象证据身份不符')
        multipart[e['fileId']] = e['sha1']
    for s in inv.execute("SELECT original_path FROM sources WHERE length(original_path)=68"):
        if CAS.fullmatch(s['original_path']):
            raise ValueError('冻结源禁止包含 CAS key')
    os.umask(0o077)
    c = sqlite3.connect(output)
    c.row_factory = sqlite3.Row
    c.executescript('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE candidates(seq INTEGER PRIMARY KEY,file_id TEXT UNIQUE,name TEXT,bytes INTEGER,sha256 TEXT,target_id TEXT,target_sha1 TEXT); CREATE TABLE blockers(file_id TEXT,name TEXT,reason TEXT); CREATE TABLE targets(sha256 TEXT PRIMARY KEY,file_id TEXT UNIQUE,name TEXT,bytes INTEGER,sha1 TEXT); CREATE TABLE preserved_cas_duplicates(file_id TEXT PRIMARY KEY,name TEXT,bytes INTEGER,sha256 TEXT,sha1 TEXT,target_id TEXT);')
    def block(row, reason):
        c.execute('INSERT INTO blockers VALUES(?,?,?)', (row['file_id'], row['name'], reason))
    try:
        # 保存并校验全部 CAS 身份，不按最新同名版本猜测目标。
        for t in inv.execute('SELECT l.*,o.bytes FROM src.b2_cas_locations l JOIN src.resource_objects o USING(sha256)'):
            v = inv.execute('SELECT * FROM versions WHERE file_id=?', (t['file_id'],)).fetchone()
            if not v or v['name'] != t['sha256'] + '.bin' or v['bytes'] != t['bytes'] or v['action'] != 'upload' or (multipart.get(v['file_id'], v['sha1']) != t['content_sha1']):
                raise ValueError('CAS 目标身份不匹配')
            latest = inv.execute('SELECT file_id FROM versions WHERE name=? ORDER BY uploaded_ms DESC,file_id DESC LIMIT 1', (v['name'],)).fetchone()
            if latest['file_id'] != v['file_id']:
                raise ValueError('CAS 当前版本不是冻结目标')
            c.execute('INSERT INTO targets VALUES(?,?,?,?,?)', (t['sha256'], t['file_id'], v['name'], t['bytes'], t['content_sha1']))
        # 证明只能登记精确的历史重复版本，既不提升当前目标，也不成为删除候选。
        duplicate_proofs = extra.get('preservedCasDuplicates', [])
        if not isinstance(duplicate_proofs, list):
            raise ValueError('CAS 重复证明必须为数组')
        seen = set()
        for proof in duplicate_proofs:
            try:
                fid = proof['fileId']
                if not isinstance(fid, str) or not fid or fid in seen:
                    raise ValueError('重复 CAS 证明身份重复')
                seen.add(fid)
                v = inv.execute('SELECT * FROM versions WHERE file_id=?', (fid,)).fetchone()
                target = proof['target']
                t = c.execute('SELECT * FROM targets WHERE sha256=?', (proof['sha256'],)).fetchone()
                if not (v and t and fid != t['file_id'] and v['action'] == 'upload'
                        and CAS.fullmatch(v['name']) and proof['name'] == v['name'] == proof['sha256'] + '.bin'
                        and type(proof['bytes']) is int and proof['bytes'] == v['bytes'] == t['bytes']
                        and re.fullmatch('[0-9a-f]{40}', proof['sha1'])
                        and proof['sha1'] == v['sha1'] == t['sha1']
                        and target['file_id'] == t['file_id'] and type(target['bytes']) is int
                        and target['bytes'] == t['bytes'] and target['content_sha1'] == t['sha1']):
                    raise ValueError('CAS 重复证明身份不符或未使用')
                c.execute('INSERT INTO preserved_cas_duplicates VALUES(?,?,?,?,?,?)',
                          (fid, v['name'], v['bytes'], proof['sha256'], proof['sha1'], t['file_id']))
            except (KeyError, TypeError):
                raise ValueError('CAS 重复证明缺字段或类型错误') from None
        unknown_lock_versions = 0
        for v in inv.execute('SELECT * FROM versions ORDER BY file_id'):
            if CAS.fullmatch(v['name']):
                if not c.execute('SELECT 1 FROM targets WHERE file_id=? UNION ALL SELECT 1 FROM preserved_cas_duplicates WHERE file_id=?', (v['file_id'], v['file_id'])).fetchone():
                    block(v, '未知 CAS 版本')
                continue
            if not unlocked(v, False if lock_disabled else None):
                unknown_lock_versions += 1
            s = inv.execute('SELECT * FROM sources WHERE source_file_id=?', (v['file_id'],)).fetchone()
            if s is None:
                p = proofs.get(v['file_id'])
                s = inv.execute('SELECT * FROM sources WHERE original_path=?', (v['name'],)).fetchone()
                t = c.execute('SELECT * FROM targets WHERE sha256=?', (s['sha256'],)).fetchone() if s else None
                if not (p and s and t and p['name'] == v['name'] and p['bytes'] == v['bytes'] == s['bytes'] and p['sha256'] == s['sha256'] and p['sha1'] == multipart.get(v['file_id'], v['sha1']) and p['target']['file_id'] == t['file_id'] and p['target']['content_sha1'] == t['sha1'] and p['target']['bytes'] == t['bytes'] and p['currentSource']['source_file_id'] == s['source_file_id'] and p['currentSource']['sha256'] == s['sha256']):
                    block(v, '未知或未证实历史版本'); continue
            t = c.execute('SELECT * FROM targets WHERE sha256=?', (s['sha256'],)).fetchone()
            if v['action'] != 'upload' or s['status'] != 'verified' or s['original_path'] != v['name'] or s['bytes'] != v['bytes'] or not t or multipart.get(v['file_id'], v['sha1']) != t['sha1']:
                block(v, '源发生变化或缺少已核验目标'); continue
            retention = json.loads(v['retention'] or 'null')
            hold = json.loads(v['legal_hold'] or 'null')
            active_lock = bool((retention and (retention.get('value') or {}).get('mode')) or (hold and hold.get('value') == 'on') or v['sse_c'])
            if active_lock or (not unlocked(v, False if lock_disabled else None) and not allow_server_enforced_lock_check):
                block(v, '锁定或锁定状态未知'); continue
            c.execute('INSERT INTO candidates(file_id,name,bytes,sha256,target_id,target_sha1) VALUES(?,?,?,?,?,?)', (v['file_id'], v['name'], v['bytes'], s['sha256'], t['file_id'], t['sha1']))
        missing = inv.execute('SELECT count(*) FROM src.b2_cas_sources s LEFT JOIN versions v ON v.file_id=s.source_file_id WHERE s.namespace=? AND v.file_id IS NULL', (NAMESPACE,)).fetchone()[0]
        if missing:
            raise ValueError('冻结源版本缺失')
        snapshot = inv.execute('SELECT inventory_sha256 FROM src.b2_cas_snapshots WHERE namespace=?', (NAMESPACE,)).fetchone()
        meta = {'schema': '2', 'preserved_cas_duplicates': str(c.execute('SELECT count(*) FROM preserved_cas_duplicates').fetchone()[0]), 'allow_server_enforced_lock_check': str(bool(allow_server_enforced_lock_check)).lower(), 'unknown_lock_versions': str(unknown_lock_versions), 'bucket': BUCKET, 'namespace': NAMESPACE, 'frozen_sha256': digest(frozen), 'inventory_sha256': digest(inventory), 'enrichment_sha256': digest(enrichment), 'snapshot_inventory_sha256': snapshot[0], 'count': str(c.execute('SELECT count(*) FROM candidates').fetchone()[0]), 'bytes': str(c.execute('SELECT coalesce(sum(bytes),0) FROM candidates').fetchone()[0]), 'blockers': str(c.execute('SELECT count(*) FROM blockers').fetchone()[0])}
        c.executemany('INSERT INTO meta VALUES(?,?)', meta.items()); c.commit(); c.close()
        os.chmod(output, 0o400)
        return {**meta, 'plan_sha256': digest(output), 'deleteCalls': 0}
    except BaseException:
        c.close(); output.unlink(missing_ok=True); raise
    finally:
        inv.close()


def receipt_check(plan, receipt, expected_receipt_sha256):
    if digest(receipt) != expected_receipt_sha256:
        raise ValueError('验收凭据摘要不符')
    p = ro(plan); meta = dict(p.execute('SELECT key,value FROM meta')); p.close()
    r = json.loads(Path(receipt).read_text())
    expected = {k: meta[k] for k in ('namespace', 'bucket', 'frozen_sha256', 'inventory_sha256', 'enrichment_sha256')}
    expected['plan_sha256'] = digest(plan)
    if any(r.get(k) != v for k, v in expected.items()) or meta['blockers'] != '0':
        raise ValueError('验收凭据与计划不符或仍有阻断项')
    revisions = ('api_revision', 'client_revision', 'issued_by')
    if (r.get('accepted') is not True or r.get('delivery_mode') != 'browser-direct-cas'
            or r.get('worker_free') is not True or 'worker_revision' in r
            or not all(isinstance(r.get(k), str) and r[k].strip() for k in revisions)
            or not isinstance(r.get('cf_config_sha256'), str)
            or not re.fullmatch('[0-9a-f]{64}', r['cf_config_sha256'])
            or not isinstance(r.get('gates'), dict)
            or not all(r['gates'].get(g) is True for g in
                       ('api', 'no_worker', 'browser', 'cas_uncached', 'range', 'reentry', 'mime', 'cors'))):
        raise ValueError('验收门槛未完成')
    return meta


@contextmanager
def apply_lock(plan, checkpoint):
    # 锁文件不能删除：保留同一个 inode，避免等待者和新进程锁住不同文件。
    plan, checkpoint = Path(plan).resolve(), Path(checkpoint).resolve()
    paths = sorted({str(plan) + '.apply.lock', str(checkpoint) + '.apply.lock'})
    with ExitStack() as stack:
        for path in paths:
            fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            lock = stack.enter_context(os.fdopen(fd, 'a+'))
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('另一个清理执行器正在使用该计划或检查点') from None
        yield plan, checkpoint


def execute(plan, checkpoint, receipt, receipt_sha256, client, batch_size=1000, limit=None):
    if not 1 <= batch_size <= 1000 or (limit is not None and limit < 0):
        raise ValueError('批大小或执行上限无效')
    os.umask(0o077)
    with apply_lock(plan, checkpoint) as (plan, checkpoint):
        return _execute_locked(plan, checkpoint, receipt, receipt_sha256, client, batch_size, limit)


def _execute_locked(plan, checkpoint, receipt, receipt_sha256, client, batch_size, limit):
    meta = receipt_check(plan, receipt, receipt_sha256)
    client = client() if callable(client) else client
    with closing(ro(plan)) as p, closing(sqlite3.connect(checkpoint)) as c:
        c.executescript('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS done(file_id TEXT PRIMARY KEY);')
        binding = digest(plan)
        old = dict(c.execute('SELECT key,value FROM meta')).get('plan_sha256')
        if old and old != binding:
            raise ValueError('检查点属于另一计划')
        c.execute('INSERT OR IGNORE INTO meta VALUES(?,?)', ('plan_sha256', binding)); c.commit()
        # 崩溃后任何未提交批次均须先查询，不能把网络异常当作失败后盲重发。
        c.execute('CREATE TABLE IF NOT EXISTS pending(file_id TEXT PRIMARY KEY,name TEXT)'); c.commit()
        def reconcile(rows):
            for row in rows:
                state = client.present(row['file_id'])
                if state is False:
                    c.execute('INSERT OR IGNORE INTO done VALUES(?)', (row['file_id'],))
                    c.execute('DELETE FROM pending WHERE file_id=?', (row['file_id'],))
                elif state is True:
                    c.execute('DELETE FROM pending WHERE file_id=?', (row['file_id'],))
                else:
                    c.commit(); raise ValueError('精确版本状态未知，停止等待复核')
            c.commit()
        c.row_factory = sqlite3.Row
        reconcile(c.execute('SELECT * FROM pending').fetchall())
        cursor = 0
        attempted = 0
        for rows in iter(lambda: p.execute('SELECT * FROM candidates WHERE seq>? ORDER BY seq LIMIT ?', (cursor, batch_size)).fetchall(), []):
            cursor = rows[-1]['seq']
            rows = [r for r in rows if not c.execute('SELECT 1 FROM done WHERE file_id=?', (r['file_id'],)).fetchone()]
            if limit is not None:
                rows = rows[:max(0, limit - attempted)]
            if not rows:
                if limit is not None and attempted >= limit: break
                continue
            if any(CAS.fullmatch(r['name']) or not r['file_id'] for r in rows): raise ValueError('禁止删除 CAS 或无版本对象')
            c.executemany('INSERT INTO pending VALUES(?,?)', [(r['file_id'], r['name']) for r in rows]); c.commit()
            try:
                response = client.delete_objects(Bucket=BUCKET, Delete={'Objects': [{'Key': r['name'], 'VersionId': r['file_id']} for r in rows], 'Quiet': False})
            except Exception:
                response = {}
            deleted = {(d.get('Key'), d.get('VersionId')) for d in response.get('Deleted', []) if not d.get('DeleteMarker')}
            uncertain = []
            for r in rows:
                if (r['name'], r['file_id']) in deleted:
                    c.execute('INSERT OR IGNORE INTO done VALUES(?)', (r['file_id'],)); c.execute('DELETE FROM pending WHERE file_id=?', (r['file_id'],))
                else: uncertain.append(r)
            c.commit(); reconcile(uncertain)
            attempted += len(rows)
            print(json.dumps({'status': 'progress', 'attempted': attempted, 'last_seq': cursor, 'batch': len(rows)}), flush=True)
            if uncertain: raise ValueError('部分或不确定结果已核对，请重跑继续')
            if limit is not None and attempted >= limit: break
        result = {'done': c.execute('SELECT count(*) FROM done').fetchone()[0], 'planned': int(meta['count'])}
        return result


class LiveClient:
    def __init__(self, config):
        import configparser
        import requests
        import boto3
        from botocore.config import Config
        cfg = configparser.ConfigParser(interpolation=None); cfg.read(config)
        self.session = requests.Session(); self.session.trust_env = False
        auth = self.session.get('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', auth=(cfg['wvn-b2']['account'], cfg['wvn-b2']['key']), timeout=(15, 60))
        if auth.status_code != 200: raise ValueError('B2 授权失败')
        a = auth.json(); storage = a['apiInfo']['storageApi']; self.url = storage['apiUrl']; self.token = a['authorizationToken']
        self.s3 = boto3.client('s3', endpoint_url=storage['s3ApiUrl'], aws_access_key_id=cfg['wvn-b2']['account'], aws_secret_access_key=cfg['wvn-b2']['key'], config=Config(retries={'total_max_attempts': 1}, proxies={}, connect_timeout=15, read_timeout=120))
    def delete_objects(self, **kw): return self.s3.delete_objects(**kw)
    def present(self, file_id):
        try:
            r = self.session.post(self.url + '/b2api/v4/b2_get_file_info', headers={'Authorization': self.token}, json={'fileId': file_id}, timeout=(15, 60))
            if r.status_code == 200: return True
            if r.status_code == 404 and r.json().get('code') == 'file_not_present': return False
        except Exception: pass
        return None


def main():
    a = argparse.ArgumentParser(); sub = a.add_subparsers(dest='command', required=True)
    b = sub.add_parser('plan')
    for k in ('frozen', 'inventory', 'enrichment', 'output'): b.add_argument('--' + k, required=True)
    b.add_argument('--allow-server-enforced-lock-check', action='store_true')
    x = sub.add_parser('apply')
    for k in ('plan', 'checkpoint', 'receipt', 'receipt-sha256', 'config'): x.add_argument('--' + k, required=True)
    x.add_argument('--batch-size', type=int, default=1000)
    x.add_argument('--limit', type=int)
    args = a.parse_args()
    try:
        if args.command == 'plan': result = build(args.frozen, args.inventory, args.enrichment, args.output, args.allow_server_enforced_lock_check)
        else:
            result = execute(args.plan, args.checkpoint, args.receipt, args.receipt_sha256, lambda: LiveClient(args.config), args.batch_size, args.limit)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        # 网络异常可能包含签名请求，禁止直接输出异常内容。
        print(json.dumps({'status': 'blocked', 'error_type': type(e).__name__}, ensure_ascii=False)); raise SystemExit(1)
if __name__ == '__main__': main()
