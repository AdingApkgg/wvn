"""B2 公共资源：完整 SHA-256、服务端复制到 .bin、SQLite 可恢复映射；不删除或上传文件。"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import configparser
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import threading
import time

import requests

APPLICATION_ID = 0x57564E43
PART_SIZE = 512 * 1024 * 1024
COPY_LIMIT = 5_000_000_000
KEY = re.compile(r'^[0-9a-f]{64}\.bin$')


class MigrationError(Exception):
    pass


class FatalMigrationError(MigrationError):
    pass


def identity(chunks, part_size=None):
    sha256, sha1 = hashlib.sha256(), hashlib.sha1()
    part, used, count, parts = hashlib.sha1(), 0, 0, []
    for chunk in chunks:
        sha256.update(chunk)
        sha1.update(chunk)
        count += len(chunk)
        if part_size:
            view = memoryview(chunk)
            while view:
                length = min(len(view), part_size - used)
                part.update(view[:length])
                used += length
                view = view[length:]
                if used == part_size:
                    parts.append(part.hexdigest())
                    part, used = hashlib.sha1(), 0
    if part_size and used:
        parts.append(part.hexdigest())
    return {'sha256': sha256.hexdigest(), 'sha1': sha1.hexdigest(), 'bytes': count, 'parts': parts}


def expected_sha1(item):
    value = item.get('contentSha1')
    if value == 'none':
        value = item.get('fileInfo', {}).get('large_file_sha1')
    return value if isinstance(value, str) and re.fullmatch('[0-9a-f]{40}', value) else None


def compact_target(item):
    # 百万级对象的内存索引只保留定位信息和归一化摘要，完整元数据仍保存在 B2。
    result = {key: item[key] for key in ('fileName', 'fileId', 'contentLength')}
    result['contentSha1'] = expected_sha1(item) or 'none'
    if (item.get('serverSideEncryption') or {}).get('mode') == 'SSE-C':
        result['serverSideEncryption'] = item['serverSideEncryption']
    return result


def valid_content(item, value):
    return value['bytes'] == item['contentLength'] and (not expected_sha1(item) or expected_sha1(item) == value['sha1'])


def file_chunks(path):
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        while chunk := stream.read(1024 * 1024):
            yield chunk
        after = os.fstat(stream.fileno())
        if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise MigrationError('本地副本在读取时发生变化')


def source_identity(client, item, local_roots):
    parts = PART_SIZE if item['contentLength'] >= COPY_LIMIT else None
    name = item['fileName']
    # 缓存只用于有传输摘要可核对的不可变源版本；过期副本退回按 fileId 读取。
    if expected_sha1(item):
        for prefix, root in local_roots:
            if not name.startswith(prefix):
                continue
            relative = PurePosixPath(name[len(prefix):])
            if relative.is_absolute() or any(p in ('..', '.') for p in relative.parts):
                continue
            path = root.joinpath(*relative.parts)
            try:
                if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or not path.is_file() or path.stat().st_size != item['contentLength']:
                    continue
                value = identity(file_chunks(path), parts)
                if valid_content(item, value):
                    return value, True
            except OSError:
                continue
    value = identity(client.chunks(item), parts)
    if not valid_content(item, value):
        raise MigrationError('源版本内容与冻结清单的大小或 SHA-1 不符')
    return value, False


class B2Remote:
    def __init__(self, config_file, remote, bucket_id, allow_direct=False):
        if not allow_direct and not (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')):
            raise MigrationError('缺少已配置的 HTTPS 代理，拒绝直连')
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_file)
        self.credentials = (config[remote]['account'], config[remote]['key'])
        self.bucket_id, self.targets, self.allow_direct = bucket_id, {}, allow_direct
        self.local = threading.local()
        self.auth_lock = threading.Lock()
        self.authorize()

    def session(self):
        if not hasattr(self.local, 'session'):
            session = requests.Session()
            session.trust_env = not self.allow_direct
            session.headers.update({'User-Agent': 'WVN-CAS/1', 'Accept-Encoding': 'identity'})
            self.local.session = session
        return self.local.session

    def authorize(self):
        with self.auth_lock:
            response = self.session().get('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', auth=self.credentials, timeout=(15, 60))
            if response.status_code != 200:
                raise MigrationError('B2 授权失败：HTTP ' + str(response.status_code))
            auth = response.json()
            storage = auth['apiInfo']['storageApi']
            allowed = storage['allowed']
            if not {'listFiles', 'readFiles', 'writeFiles'} <= set(allowed['capabilities']) or allowed.get('namePrefix'):
                raise MigrationError('密钥没有全桶列举、读取和写入权限')
            if allowed.get('buckets') is not None and not any(b['id'] == self.bucket_id for b in allowed['buckets']):
                raise MigrationError('密钥没有目标桶权限')
            self.api_url, self.download_url, self.token = storage['apiUrl'], storage['downloadUrl'], auth['authorizationToken']

    def api(self, method, parameters, retry=True, refreshed=False):
        for attempt in range(6 if retry else 1):
            try:
                response = self.session().post(self.api_url + '/b2api/v4/' + method, json=parameters,
                    headers={'Authorization': self.token}, timeout=(15, 150))
                if response.status_code == 200:
                    return response.json()
                try:
                    code = response.json().get('code', '')
                except ValueError:
                    code = ''
                if response.status_code == 401 and code == 'expired_auth_token' and not refreshed:
                    self.authorize()
                    # 明确的 401 表示写入尚未执行，更新令牌后可以安全重发一次。
                    return self.api(method, parameters, retry=retry, refreshed=True)
                if response.status_code in (401, 403):
                    raise FatalMigrationError('B2 权限或配额限制：' + method + ' HTTP ' + str(response.status_code) + ' ' + code)
                if response.status_code < 500 and response.status_code not in (408, 429):
                    raise MigrationError('B2 ' + method + ' HTTP ' + str(response.status_code) + ' ' + code)
            except requests.RequestException:
                pass
            if attempt + 1 < (6 if retry else 1):
                time.sleep(min(20, 2 ** attempt))
        raise MigrationError('B2 请求失败或结果未知：' + method)

    def list_files(self, prefix=''):
        parameters = {'bucketId': self.bucket_id, 'prefix': prefix, 'maxFileCount': 10000}
        while True:
            page = self.api('b2_list_file_names', parameters)
            yield from page['files']
            if not page.get('nextFileName'):
                return
            parameters['startFileName'] = page['nextFileName']

    def exact(self, key):
        page = self.api('b2_list_file_names', {'bucketId': self.bucket_id, 'prefix': key, 'maxFileCount': 1})
        return next((f for f in page['files'] if f['fileName'] == key), None)

    def chunks(self, item):
        if (item.get('serverSideEncryption') or {}).get('mode') == 'SSE-C':
            raise MigrationError('资源使用 SSE-C，当前任务没有客户加密密钥')
        for attempt in range(3):
            try:
                response = self.session().get(self.download_url + '/b2api/v4/b2_download_file_by_id',
                    params={'fileId': item['fileId']}, headers={'Authorization': self.token},
                    stream=True, allow_redirects=False, timeout=(15, 150))
                if response.status_code == 401 and attempt < 2:
                    response.close()
                    self.authorize()
                    continue
                if response.status_code != 200:
                    response.close()
                    raise MigrationError('B2 源版本读取失败：HTTP ' + str(response.status_code))
                with response:
                    # 哈希对应对象原始字节，不能被 HTTP Content-Encoding 自动解压。
                    yield from response.raw.stream(1024 * 1024, decode_content=False)
                return
            except requests.RequestException:
                raise MigrationError('B2 源版本响应体读取失败，可重跑断点任务') from None
        raise MigrationError('B2 源版本读取授权失败')

    def copy(self, item, key, value):
        info = dict(item.get('fileInfo') or {})
        info.update({'wvn-sha256': value['sha256'], 'wvn-source-file-id': item['fileId']})
        parameters = {'sourceFileId': item['fileId'], 'destinationBucketId': self.bucket_id,
            'fileName': key, 'metadataDirective': 'REPLACE', 'contentType': item['contentType'], 'fileInfo': info}
        try:
            if value['bytes'] < COPY_LIMIT:
                return self.api('b2_copy_file', parameters, retry=False)
            info['large_file_sha1'] = value['sha1']
            started = self.api('b2_start_large_file', {'bucketId': self.bucket_id, 'fileName': key,
                'contentType': item['contentType'], 'fileInfo': info}, retry=False)
            for number, digest in enumerate(value['parts'], 1):
                start = (number - 1) * PART_SIZE
                end = min(value['bytes'], number * PART_SIZE) - 1
                part = self.api('b2_copy_part', {'sourceFileId': item['fileId'], 'largeFileId': started['fileId'],
                    'partNumber': number, 'range': f'bytes={start}-{end}'})
                if part['contentSha1'] != digest or part['contentLength'] != end - start + 1:
                    raise MigrationError('服务端分段复制摘要不符')
            return self.api('b2_finish_large_file', {'fileId': started['fileId'], 'partSha1Array': value['parts']}, retry=False)
        except MigrationError:
            # 写请求响应丢失时不盲目重试创建新版本，先确认目标回执。
            found = self.exact(key)
            if found and valid_content(found, value) and found.get('fileInfo', {}).get('wvn-sha256') == value['sha256']:
                return found
            raise


def database(file):
    file = Path(file)
    if file.is_symlink():
        raise MigrationError('映射数据库不能是符号链接')
    file.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(file, timeout=30)
    db.row_factory = sqlite3.Row
    app = db.execute('PRAGMA application_id').fetchone()[0]
    version = db.execute('PRAGMA user_version').fetchone()[0]
    tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    if not ((app == 0 and version == 0 and not tables) or (app == APPLICATION_ID and version == 1)):
        db.close()
        raise MigrationError('目标必须是独立资源映射库')
    db.executescript(f"""
        PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000; PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS resource_objects(
          sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
          bytes INTEGER NOT NULL CHECK(bytes>=0 AND bytes<=9007199254740991)) STRICT;
        CREATE TABLE IF NOT EXISTS resource_paths(
          namespace TEXT NOT NULL CHECK(length(namespace)>0), original_path TEXT NOT NULL CHECK(length(original_path)>0),
          sha256 TEXT NOT NULL REFERENCES resource_objects(sha256), content_type TEXT NOT NULL CHECK(length(content_type)>0),
          PRIMARY KEY(namespace,original_path)) STRICT;
        CREATE INDEX IF NOT EXISTS resource_paths_sha256 ON resource_paths(sha256);
        CREATE TABLE IF NOT EXISTS b2_cas_sources(
          namespace TEXT NOT NULL, original_path TEXT NOT NULL, source_file_id TEXT NOT NULL,
          sha256 TEXT REFERENCES resource_objects(sha256), status TEXT NOT NULL CHECK(status IN ('verified','error')),
          error TEXT, PRIMARY KEY(namespace,original_path)) STRICT;
        CREATE TABLE IF NOT EXISTS b2_cas_locations(
          sha256 TEXT PRIMARY KEY REFERENCES resource_objects(sha256), file_id TEXT NOT NULL, content_sha1 TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS b2_cas_snapshots(namespace TEXT PRIMARY KEY, inventory_sha256 TEXT NOT NULL) STRICT;
        PRAGMA application_id={APPLICATION_ID}; PRAGMA user_version=1;
    """)
    return db


def migrate(client, rows, db_file, namespace, local_roots=(), workers=16, progress=None, inventory_sha256=None):
    if not namespace or not 1 <= workers <= 128:
        raise MigrationError('命名空间或工作线程数无效')
    db = database(db_file)
    try:
        if inventory_sha256:
            old = db.execute('SELECT inventory_sha256 FROM b2_cas_snapshots WHERE namespace=?', (namespace,)).fetchone()
            if old and old[0] != inventory_sha256:
                raise MigrationError('同一命名空间必须使用同一份冻结清单')
            db.execute('INSERT OR IGNORE INTO b2_cas_snapshots VALUES(?,?)', (namespace, inventory_sha256))
            db.commit()
        locks = [threading.Lock() for _ in range(256)]
        ready = {}
        report = {'status': 'running', 'processed': 0, 'verified': 0, 'errors': 0, 'copiedObjects': 0,
            'reusedMappings': 0, 'bytesVerified': 0, 'localHashFiles': 0, 'remoteHashFiles': 0,
            'startedAt': time.time()}

        def process(item):
            try:
                value, local = source_identity(client, item, local_roots)
                key = value['sha256'] + '.bin'
                with locks[int(value['sha256'][:2], 16)]:
                    created = False
                    target = ready.get(key)
                    if target is None:
                        target = client.targets.get(key)
                        if target:
                            checked = identity(client.chunks(target))
                            if checked['sha256'] != value['sha256'] or checked['bytes'] != value['bytes']:
                                raise MigrationError('已有 .bin 对象校验失败，拒绝覆盖')
                        else:
                            target = client.copy(item, key, value)
                            created = True
                        if target['fileName'] != key or not valid_content(target, value):
                            raise MigrationError('服务端复制回执校验失败')
                        ready[key] = compact_target(target)
                    return item, value, target, created, local, None
            except FatalMigrationError:
                raise
            except Exception as error:
                message = str(error) if isinstance(error, MigrationError) else type(error).__name__
                return item, None, None, False, False, message

        def save(result):
            item, value, target, created, local, error = result
            report['processed'] += 1
            if error:
                report['errors'] += 1
                db.execute('INSERT INTO b2_cas_sources VALUES(?,?,?,NULL,?,?) ON CONFLICT(namespace,original_path) DO UPDATE SET status=excluded.status,error=excluded.error',
                    (namespace, item['fileName'], item['fileId'], 'error', error))
                return
            sha = value['sha256']
            old = db.execute('SELECT bytes FROM resource_objects WHERE sha256=?', (sha,)).fetchone()
            path = db.execute('SELECT sha256 FROM resource_paths WHERE namespace=? AND original_path=?', (namespace, item['fileName'])).fetchone()
            if (old and old[0] != value['bytes']) or (path and path[0] != sha):
                raise MigrationError('既有 SQLite 内容身份冲突，停止写入')
            db.execute('INSERT OR IGNORE INTO resource_objects VALUES(?,?)', (sha, value['bytes']))
            db.execute('INSERT OR IGNORE INTO resource_paths VALUES(?,?,?,?)', (namespace, item['fileName'], sha, item['contentType']))
            db.execute('INSERT INTO b2_cas_locations VALUES(?,?,?) ON CONFLICT(sha256) DO UPDATE SET file_id=excluded.file_id,content_sha1=excluded.content_sha1', (sha, target['fileId'], value['sha1']))
            db.execute('INSERT INTO b2_cas_sources VALUES(?,?,?,?,?,NULL) ON CONFLICT(namespace,original_path) DO UPDATE SET source_file_id=excluded.source_file_id,sha256=excluded.sha256,status=excluded.status,error=NULL',
                (namespace, item['fileName'], item['fileId'], sha, 'verified'))
            report['verified'] += 1
            report['bytesVerified'] += value['bytes']
            report['copiedObjects'] += int(created)
            report['reusedMappings'] += int(not created)
            report['localHashFiles' if local else 'remoteHashFiles'] += 1

        def resumed(item):
            old = db.execute('''SELECT s.sha256,o.bytes,l.file_id,l.content_sha1 FROM b2_cas_sources s
                JOIN resource_objects o ON o.sha256=s.sha256 JOIN b2_cas_locations l ON l.sha256=s.sha256
                WHERE s.namespace=? AND s.original_path=? AND s.source_file_id=? AND s.status='verified' ''',
                (namespace, item['fileName'], item['fileId'])).fetchone()
            target = client.targets.get(old['sha256'] + '.bin') if old else None
            if not target or target['fileId'] != old['file_id'] or target['contentLength'] != old['bytes'] or expected_sha1(target) != old['content_sha1']:
                return False
            report['processed'] += 1
            report['verified'] += 1
            report['reusedMappings'] += 1
            report['bytesVerified'] += old['bytes']
            return True

        iterator, pending, finished, last_update = iter(rows), set(), False, time.monotonic()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            while pending or not finished:
                while not finished and len(pending) < workers * 2:
                    try:
                        item = next(iterator)
                    except StopIteration:
                        finished = True
                        break
                    if not resumed(item):
                        pending.add(pool.submit(process, item))
                if pending:
                    done, pending = wait(pending, timeout=5, return_when=FIRST_COMPLETED)
                    for future in done:
                        save(future.result())
                if report['processed'] % 100 == 0 or time.monotonic() - last_update >= 10:
                    db.commit()
                    if progress:
                        progress(dict(report, updatedAt=time.time()))
                    last_update = time.monotonic()
        db.commit()
        report.update(status='attention' if report['errors'] else 'complete', updatedAt=time.time(),
            uniqueObjects=db.execute('SELECT count(*) FROM resource_objects').fetchone()[0])
        if progress:
            progress(report)
        return report
    finally:
        db.close()


def write_json(file, value):
    file = Path(file)
    temporary = file.with_suffix(file.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(file)


def verify_cloud(client, file):
    with sqlite3.connect(file) as db:
        expected = {row[0] + '.bin': row[1:] for row in db.execute('''SELECT o.sha256,o.bytes,l.file_id,l.content_sha1
            FROM resource_objects o JOIN b2_cas_locations l ON l.sha256=o.sha256''')}
        foreign_keys = db.execute('PRAGMA foreign_key_check').fetchall()
    total, checked, differences = len(expected), 0, []
    for first in '0123456789abcdef':
        for item in client.list_files(first):
            record = expected.pop(item['fileName'], None)
            if record is None:
                continue
            size, file_id, sha1 = record
            if item['contentLength'] != size or item['fileId'] != file_id or expected_sha1(item) != sha1:
                differences.append(item['fileName'])
            else:
                checked += 1
    return {'expectedObjects': total, 'verifiedObjects': checked, 'missingObjects': len(expected),
        'differences': differences[:100], 'differenceCount': len(differences), 'foreignKeyViolations': len(foreign_keys)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--remote', default='wvn-b2')
    parser.add_argument('--bucket-id', required=True)
    parser.add_argument('--namespace', required=True)
    parser.add_argument('--progress', required=True)
    parser.add_argument('--workers', type=int, default=32)
    parser.add_argument('--local-roots', help='包含 prefix/root 条目的 JSON 数组')
    parser.add_argument('--limit', type=int, help='小批试运行，仅处理冻结清单前 N 项')
    parser.add_argument('--apply', action='store_true', help='显式允许服务端创建 .bin 对象；绝不删除旧对象')
    parser.add_argument('--allow-direct', action='store_true', help='仅限用户已明确授权的服务器直连 B2，不改变系统代理')
    args = parser.parse_args()
    if not args.apply:
        parser.error('云端复制需要显式 --apply；清单预演与命名检查完成后再执行')
    client = B2Remote(args.config, args.remote, args.bucket_id, args.allow_direct)
    # 只枚举哈希可能的首字符，避免重跑时把新目标重新当作输入源。
    for first in '0123456789abcdef':
        for item in client.list_files(first):
            if KEY.fullmatch(item['fileName']):
                client.targets[item['fileName']] = compact_target(item)
    roots = [(row['prefix'], Path(row['root'])) for row in json.loads(Path(args.local_roots).read_text())] if args.local_roots else []
    roots.sort(key=lambda row: len(row[0]), reverse=True)
    inventory = Path(args.inventory)
    snapshot_hash = identity(file_chunks(inventory))['sha256']
    def rows():
        with inventory.open() as stream:
            for index, line in enumerate(stream):
                if args.limit is not None and index >= args.limit:
                    break
                item = json.loads(line)
                if item.get('action') != 'upload' or not item.get('fileId') or not isinstance(item.get('contentLength'), int) or item['contentLength'] < 0:
                    raise MigrationError('冻结清单包含非法资源记录')
                yield item
    import fcntl
    Path(args.database).parent.mkdir(parents=True, exist_ok=True)
    with Path(args.database + '.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def progress(value):
            value = dict(value, networkMode='direct' if args.allow_direct else 'proxy')
            if value['status'] == 'complete':
                value = dict(value, status='verifying')
            write_json(args.progress, value)
        result = migrate(client, rows(), args.database, args.namespace, roots, args.workers,
            progress, snapshot_hash)
        if not result['errors']:
            verification = verify_cloud(client, args.database)
            result['cloudVerification'] = verification
            if verification['missingObjects'] or verification['differenceCount'] or verification['foreignKeyViolations']:
                result['status'] = 'attention'
        result.update(networkMode='direct' if args.allow_direct else 'proxy', updatedAt=time.time())
        write_json(args.progress, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] == 'complete' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except MigrationError as error:
        print(str(error), file=__import__('sys').stderr)
        raise SystemExit(1)
