"""B2 CAS 的内容身份、服务端复制及 SQLite 回执回归。"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / 'scripts/migration/b2-cas.py'
spec = importlib.util.spec_from_file_location('b2_cas', SCRIPT)
cas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cas)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class MemoryB2:
    """内存存储仅模拟传输边界；内容哈希和数据库写入均使用待测实现。"""
    def __init__(self):
        self.data, self.targets, self.copies, self.downloads = {}, {}, [], []
        self.lock = threading.Lock()
        self.fail = set()

    def source(self, name, data, kind='application/octet-stream'):
        file_id = 'source-' + str(len(self.data))
        self.data[file_id] = data
        return {'fileName': name, 'fileId': file_id, 'contentLength': len(data),
                'contentSha1': hashlib.sha1(data).hexdigest(), 'contentType': kind, 'fileInfo': {}}

    def chunks(self, item):
        self.downloads.append(item['fileId'])
        data = self.data[item['fileId']]
        for offset in range(0, len(data), 5):
            yield data[offset:offset + 5]

    def list_files(self, prefix=''):
        yield from (item for name, item in self.targets.items() if name.startswith(prefix))

    def copy(self, item, key, identity):
        if item['fileName'] in self.fail:
            raise cas.MigrationError('合成复制失败')
        with self.lock:
            self.copies.append((item['fileId'], key))
            new_id = 'target-' + str(len(self.copies))
            self.data[new_id] = self.data[item['fileId']]
            result = dict(item, fileId=new_id, fileName=key,
                          fileInfo={'wvn-sha256': identity['sha256']})
            self.targets[key] = result
            return result


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'resources.sqlite'
        self.client = MemoryB2()

    def run_rows(self, rows, **kwargs):
        return cas.migrate(self.client, rows, self.db, 'bucket/snapshot', workers=4, **kwargs)

    def cache(self, row, **changes):
        path = self.root / 'hash-cache.sqlite'
        value = {'file_id': row['fileId'], 'file_name': row['fileName'], 'bytes': row['contentLength'],
                 'sha1': cas.expected_sha1(row), 'sha256': sha256(self.client.data[row['fileId']]), **changes}
        with sqlite3.connect(path) as db:
            db.executescript('''CREATE TABLE cache_snapshot(inventory_sha256 TEXT);
                INSERT INTO cache_snapshot VALUES('snapshot');
                CREATE TABLE source_hashes(file_id TEXT PRIMARY KEY,file_name TEXT,bytes INTEGER,sha1 TEXT,sha256 TEXT);''')
            db.execute('INSERT INTO source_hashes VALUES(:file_id,:file_name,:bytes,:sha1,:sha256)', value)
        cache = cas.HashCache(path, 'snapshot')
        self.addCleanup(cache.close)
        return cache

    def test_bound_sha256_cache_avoids_source_download_and_preserves_copy_verification(self):
        row = self.client.source('releases/a.png', b'cached-content')
        result = self.run_rows([row], hash_cache=self.cache(row))
        self.assertEqual(self.client.downloads, [])
        self.assertEqual(result['cachedHashFiles'], 1)
        self.assertEqual(result['cachedHashBytes'], len(b'cached-content'))
        self.assertEqual(result['remoteHashFiles'], 0)
        self.assertEqual(self.client.copies, [(row['fileId'], sha256(b'cached-content') + '.bin')])
        self.assertEqual(cas.verify_cloud(self.client, self.db)['verifiedObjects'], 1)

    def test_cache_version_name_size_and_sha1_mismatches_fall_back_to_full_source_read(self):
        row = self.client.source('releases/a.png', b'current-content')
        cache = self.cache(row)
        for field, value in [('fileId', 'new-version'), ('fileName', 'new-name'),
                             ('contentLength', row['contentLength'] + 1), ('contentSha1', '0' * 40)]:
            with self.subTest(field=field):
                self.assertIsNone(cache.lookup(dict(row, **{field: value})))
        with sqlite3.connect(self.root / 'hash-cache.sqlite') as db:
            db.execute("UPDATE source_hashes SET sha1=?", ('0' * 40,))
        result = self.run_rows([row], hash_cache=cache)
        self.assertEqual(result['cachedHashFiles'], 0)
        self.assertEqual(self.client.downloads, [row['fileId']])

    def test_hash_cache_from_another_snapshot_is_rejected(self):
        row = self.client.source('a.png', b'content')
        self.cache(row)
        with self.assertRaises(cas.MigrationError):
            cas.HashCache(self.root / 'hash-cache.sqlite', 'other-snapshot')

    def test_readonly_cache_sees_new_verified_bindings_without_restarting(self):
        first = self.client.source('first.png', b'first')
        second = self.client.source('second.png', b'second')
        cache = self.cache(first)
        self.assertIsNone(cache.lookup(second))
        with sqlite3.connect(self.root / 'hash-cache.sqlite') as writer:
            writer.execute('INSERT INTO source_hashes VALUES(?,?,?,?,?)',
                (second['fileId'], second['fileName'], second['contentLength'], cas.expected_sha1(second), sha256(b'second')))
        result = self.run_rows([first, second], hash_cache=cache)
        self.assertEqual(result['cachedHashFiles'], 2)
        self.assertEqual(self.client.downloads, [])

    def test_cached_identity_never_skips_validation_of_an_existing_bin(self):
        row = self.client.source('a.png', b'good')
        key = sha256(b'good') + '.bin'
        self.client.targets[key] = self.client.source(key, b'evil')
        result = self.run_rows([row], hash_cache=self.cache(row))
        self.assertEqual(result['errors'], 1)
        self.assertEqual(self.client.copies, [])
        self.assertNotIn(row['fileId'], self.client.downloads)

    def test_cache_does_not_bypass_multipart_hashing_or_customer_encryption_requirements(self):
        row = self.client.source('a.png', b'content')
        cache = self.cache(row)
        with patch.object(cas, 'COPY_LIMIT', 1):
            self.assertIsNone(cache.lookup(row))
        self.assertIsNone(cache.lookup(dict(row, serverSideEncryption={'mode': 'SSE-C'})))

    def test_pause_drains_inflight_work_saves_receipts_and_resumes_without_recopy(self):
        rows = [self.client.source(str(i), str(i).encode()) for i in range(100)]
        result = self.run_rows(rows, stop_requested=lambda: bool(self.client.copies))
        self.assertEqual(result['status'], 'paused')
        self.assertGreater(result['verified'], 0)
        self.assertLess(result['verified'], len(rows))
        finished = result['verified']
        result = self.run_rows(rows)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['verified'], len(rows))
        self.assertEqual(result['resumedFiles'], finished)
        self.assertEqual(len(self.client.copies), len(rows))

    def test_server_copy_deduplicates_and_preserves_original_path_mime_and_version(self):
        rows = [self.client.source('imports/背景 #1.png', b'same', 'image/png'),
                self.client.source('releases/engine.wasm', b'same', 'application/wasm'),
                self.client.source('releases/empty.data', b'')]
        result = self.run_rows(rows)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['verified'], 3)
        self.assertEqual(len(self.client.copies), 2)
        self.assertEqual(set(self.client.targets), {sha256(b'same') + '.bin', sha256(b'') + '.bin'})
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM resource_paths').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT count(*) FROM resource_objects').fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT content_type FROM resource_paths WHERE original_path=?", ('imports/背景 #1.png',)).fetchone()[0], 'image/png')
            self.assertEqual(db.execute('SELECT source_file_id FROM b2_cas_sources WHERE original_path=?', ('imports/背景 #1.png',)).fetchone()[0], rows[0]['fileId'])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertTrue(all(row['fileId'] in self.client.data for row in rows))

    def test_resume_does_not_copy_or_hash_successful_immutable_versions_again(self):
        rows = [self.client.source('a.png', b'content')]
        self.run_rows(rows)
        downloads = len(self.client.downloads)
        self.client.targets = {key: cas.compact_target(item) for key, item in self.client.targets.items()}
        result = self.run_rows(rows)
        self.assertEqual(result['verified'], 1)
        self.assertEqual(len(self.client.copies), 1)
        self.assertEqual(len(self.client.downloads), downloads)

    def test_existing_corrupt_bin_is_not_overwritten_or_added_as_mapping(self):
        row = self.client.source('a.png', b'good')
        key = sha256(b'good') + '.bin'
        self.client.targets[key] = self.client.source(key, b'evil')
        result = self.run_rows([row])
        self.assertEqual(result['status'], 'attention')
        self.assertEqual(result['errors'], 1)
        self.assertEqual(self.client.copies, [])
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM resource_paths').fetchone()[0], 0)

    def test_a_failed_copy_has_no_ready_mapping_and_can_be_resumed(self):
        rows = [self.client.source('a.txt', b'aaa'), self.client.source('b.txt', b'bbb')]
        self.client.fail.add('b.txt')
        result = self.run_rows(rows)
        self.assertEqual(result['verified'], 1)
        self.assertEqual(result['errors'], 1)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM resource_paths').fetchone()[0], 1)
        self.client.fail.clear()
        result = self.run_rows(rows)
        self.assertEqual(result['verified'], 2)
        self.assertEqual(result['errors'], 0)
        self.assertEqual(len(self.client.copies), 2)

    def test_local_cache_is_streamed_and_checked_against_the_frozen_source(self):
        local = self.root / 'cache'
        local.mkdir()
        (local / 'a.png').write_bytes(b'right')
        row = self.client.source('imports/a.png', b'right')
        self.run_rows([row], local_roots=[('imports/', local)])
        self.assertEqual(self.client.downloads, [])
        self.assertEqual(self.client.data[self.client.targets[sha256(b'right') + '.bin']['fileId']], b'right')

    def test_stale_local_cache_is_not_used_for_the_new_content_key(self):
        local = self.root / 'cache'
        local.mkdir()
        (local / 'a.png').write_bytes(b'wrong')
        row = self.client.source('imports/a.png', b'right')
        result = self.run_rows([row], local_roots=[('imports/', local)])
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(set(self.client.targets), {sha256(b'right') + '.bin'})
        self.assertIn(row['fileId'], self.client.downloads)

    def test_unrelated_database_is_rejected_without_schema_changes(self):
        with sqlite3.connect(self.db) as db:
            db.execute('CREATE TABLE private_data(value TEXT)')
        with self.assertRaises(cas.MigrationError):
            self.run_rows([])
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(), [('private_data',)])

    def test_streaming_identity_includes_every_byte_and_part_boundaries(self):
        data = b'0123456789abcdefghij'
        result = cas.identity([data[:3], data[3:12], data[12:]], part_size=8)
        self.assertEqual(result['sha256'], sha256(data))
        self.assertEqual(result['sha1'], hashlib.sha1(data).hexdigest())
        self.assertEqual(result['bytes'], len(data))
        self.assertEqual(result['parts'], [hashlib.sha1(data[n:n+8]).hexdigest() for n in range(0, len(data), 8)])

    def test_compact_target_keeps_large_file_digest_without_full_metadata(self):
        item = {'fileName': 'key.bin', 'fileId': 'version', 'contentLength': 100, 'contentSha1': 'none',
                'fileInfo': {'large_file_sha1': 'a' * 40, 'unused': 'x' * 10000}, 'contentType': 'image/png'}
        result = cas.compact_target(item)
        self.assertEqual(cas.expected_sha1(result), 'a' * 40)
        self.assertEqual(result['fileId'], 'version')
        self.assertNotIn('fileInfo', result)

    def test_final_cloud_listing_detects_missing_or_replaced_target_versions(self):
        self.run_rows([self.client.source('a.png', b'data')])
        checked = cas.verify_cloud(self.client, self.db)
        self.assertEqual(checked['verifiedObjects'], 1)
        key = sha256(b'data') + '.bin'
        original = self.client.targets.pop(key)
        self.assertEqual(cas.verify_cloud(self.client, self.db)['missingObjects'], 1)
        self.client.targets[key] = dict(original, fileId='replaced-version')
        self.assertEqual(cas.verify_cloud(self.client, self.db)['differenceCount'], 1)


class CopyProtocolTests(unittest.TestCase):
    def setUp(self):
        self.remote = object.__new__(cas.B2Remote)
        self.remote.bucket_id = 'bucket'
        self.item = {'fileId': 'frozen-source-version', 'fileName': 'old.png', 'contentType': 'image/png',
                     'fileInfo': {'b2-cache-control': 'public, max-age=3600'}}

    def test_small_copy_preserves_real_type_metadata_and_uses_no_upload_api(self):
        calls = []
        def api(method, params, retry=True):
            calls.append((method, params, retry))
            return {'fileId': 'copied'}
        self.remote.api = api
        value = cas.identity([b'data'])
        key = value['sha256'] + '.bin'
        self.remote.copy(self.item, key, value)
        self.assertEqual(len(calls), 1)
        method, params, retry = calls[0]
        self.assertEqual(method, 'b2_copy_file')
        self.assertFalse(retry)
        self.assertEqual(params['fileName'], key)
        self.assertEqual(params['sourceFileId'], 'frozen-source-version')
        self.assertEqual(params['contentType'], 'image/png')
        self.assertEqual(params['fileInfo']['b2-cache-control'], 'public, max-age=3600')
        self.assertEqual(params['fileInfo']['wvn-sha256'], value['sha256'])

    def test_lost_copy_response_is_checked_without_blindly_creating_another_version(self):
        calls = []
        value = cas.identity([b'data'])
        key = value['sha256'] + '.bin'
        def api(method, params, retry=True):
            calls.append(method)
            raise cas.MigrationError('合成响应丢失')
        self.remote.api = api
        receipt = {'fileId': 'copied', 'fileName': key, 'contentLength': 4,
                   'contentSha1': value['sha1'], 'fileInfo': {'wvn-sha256': value['sha256']}}
        self.remote.exact = lambda name: receipt
        self.assertEqual(self.remote.copy(self.item, key, value), receipt)
        self.assertEqual(calls, ['b2_copy_file'])

    def test_large_copy_checks_each_range_and_part_digest_before_finish(self):
        data = b'0123456789abcdefghij'
        value = cas.identity([data], part_size=8)
        calls = []
        def api(method, params, retry=True):
            calls.append((method, params))
            if method == 'b2_start_large_file':
                return {'fileId': 'large-destination'}
            if method == 'b2_copy_part':
                start, end = map(int, params['range'].removeprefix('bytes=').split('-'))
                chunk = data[start:end+1]
                return {'contentSha1': hashlib.sha1(chunk).hexdigest(), 'contentLength': len(chunk)}
            return {'fileId': 'large-destination'}
        self.remote.api = api
        with patch.object(cas, 'COPY_LIMIT', 16), patch.object(cas, 'PART_SIZE', 8):
            self.remote.copy(self.item, value['sha256'] + '.bin', value)
        self.assertEqual([p['range'] for method, p in calls if method == 'b2_copy_part'], ['bytes=0-7', 'bytes=8-15', 'bytes=16-19'])
        self.assertEqual(calls[-1], ('b2_finish_large_file', {'fileId': 'large-destination', 'partSha1Array': value['parts']}))
        self.assertFalse(any('upload' in method for method, _ in calls))

    def test_expired_token_is_refreshed_even_for_a_nonretrying_copy_request(self):
        responses = [SimpleNamespace(status_code=401, json=lambda: {'code': 'expired_auth_token'}),
                     SimpleNamespace(status_code=200, json=lambda: {'fileId': 'copied'})]
        calls, refreshes = [], []
        self.remote.api_url, self.remote.token = 'https://api.example.invalid', 'synthetic-token'
        def post(*args, **kwargs):
            calls.append(args[0])
            return responses.pop(0)
        self.remote.session = lambda: SimpleNamespace(post=post)
        self.remote.authorize = lambda: refreshes.append(True)
        self.assertEqual(self.remote.api('b2_copy_file', {'fileName': 'key'}, retry=False), {'fileId': 'copied'})
        self.assertEqual(len(refreshes), 1)
        self.assertEqual(len(calls), 2)

    def test_direct_mode_requires_an_explicit_exception_and_does_not_change_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'rclone.conf'
            config.write_text('[wvn-b2]\naccount=synthetic-account\nkey=synthetic-key\n')
            with patch.dict(os.environ, {'HTTPS_PROXY': '', 'https_proxy': ''}), patch.object(cas.B2Remote, 'authorize'):
                with self.assertRaises(cas.MigrationError):
                    cas.B2Remote(config, 'wvn-b2', 'bucket')
                remote = cas.B2Remote(config, 'wvn-b2', 'bucket', allow_direct=True)
                self.assertFalse(remote.session().trust_env)
                self.assertEqual(os.environ['HTTPS_PROXY'], '')


if __name__ == '__main__':
    unittest.main()
