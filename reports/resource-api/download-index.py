"""仅在构建机读取临时票据，固定 CA、代理、Range 与双重摘要下载公共索引。"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
from urllib.parse import urljoin, urlparse

import requests

ROOT = Path('/home/i/wvn-platform-20261029')
TICKET = ROOT / 'private/index-client.json'
DATA = ROOT / 'data'
REPORT = ROOT / 'source/reports/resource-api/full-download.json'
EXPECTED = {
    'gzipSha256': '663440a08172ae298c52c11444ba1040ddc3f702796dbf44d18da919a598fb1b',
    'gzipBytes': 385580112,
    'sourceSha256': '2a04ee201a45363d073eb09f80c0d6ac93089ceeb0b90a5ca850084a18e0e7ee',
    'sourceBytes': 1786675200,
}


class DownloadError(Exception):
    pass


def emit(phase, **values):
    print(json.dumps({'phase': phase, **values}, ensure_ascii=False), flush=True)


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def private_write(path, value):
    fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(value)
    os.chmod(path, 0o600)


def main():
    started = time.time()
    if stat.S_IMODE(TICKET.stat().st_mode) != 0o600:
        raise DownloadError('TICKET_PERMISSIONS')
    ticket = json.loads(TICKET.read_text())
    if any(ticket.get(key) != value for key, value in EXPECTED.items()):
        raise DownloadError('TICKET_DIGEST_MISMATCH')
    endpoint = urlparse(ticket['url'])
    if endpoint.scheme != 'https' or endpoint.username or endpoint.password:
        raise DownloadError('INVALID_ENDPOINT')
    if not (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')):
        raise DownloadError('PROXY_REQUIRED')
    ca = ticket['ca']
    if isinstance(ca, str) and '-----BEGIN CERTIFICATE-----' in ca:
        ca_path = ROOT / 'private/index-download-ca.pem'
        private_write(ca_path, ca)
    elif isinstance(ca, str) and Path(ca).is_file():
        ca_path = Path(ca)
    else:
        raise DownloadError('CA_REQUIRED')
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    target = DATA / 'resources.sqlite.gz'
    partial = DATA / 'resources.sqlite.gz.partial'
    meta = DATA / 'resources.sqlite.gz.partial.meta.json'
    session = requests.Session()
    session.headers.update({'Authorization': 'Bearer ' + ticket['token'], 'Accept-Encoding': 'identity'})
    session.verify = str(ca_path)
    download_started = time.time()
    if target.exists():
        if target.stat().st_size != EXPECTED['gzipBytes'] or file_digest(target) != EXPECTED['gzipSha256']:
            raise DownloadError('EXISTING_GZIP_MISMATCH')
    else:
        if partial.exists() and (not meta.exists() or json.loads(meta.read_text()) != EXPECTED):
            raise DownloadError('PARTIAL_IDENTITY_UNKNOWN')
        private_write(meta, json.dumps(EXPECTED))
        for attempt in range(1, 7):
            offset = partial.stat().st_size if partial.exists() else 0
            if offset > EXPECTED['gzipBytes']:
                raise DownloadError('PARTIAL_TOO_LARGE')
            if offset == EXPECTED['gzipBytes']:
                break
            headers = {'Range': 'bytes=' + str(offset) + '-', 'If-Range': '"' + EXPECTED['gzipSha256'] + '"'} if offset else {}
            emit('download', attempt=attempt, resumedBytes=offset, totalBytes=EXPECTED['gzipBytes'])
            try:
                with session.get(ticket['url'], headers=headers, stream=True, timeout=(15, 90), verify=str(ca_path), allow_redirects=False) as response:
                    if response.status_code not in (200, 206):
                        raise DownloadError('DOWNLOAD_HTTP_' + str(response.status_code))
                    if response.headers.get('ETag', '').strip('"') != EXPECTED['gzipSha256']:
                        raise DownloadError('ETAG_MISMATCH')
                    if response.status_code == 206:
                        found = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
                        if not found or int(found[1]) != offset or int(found[3]) != EXPECTED['gzipBytes']:
                            raise DownloadError('CONTENT_RANGE_MISMATCH')
                    elif offset:
                        offset = 0
                    if int(response.headers.get('Content-Length', '-1')) != EXPECTED['gzipBytes'] - offset:
                        raise DownloadError('CONTENT_LENGTH_MISMATCH')
                    flags = os.O_WRONLY | os.O_CREAT | (os.O_APPEND if offset else os.O_TRUNC)
                    fd = os.open(partial, flags, 0o600)
                    with os.fdopen(fd, 'ab' if offset else 'wb') as stream:
                        last = time.monotonic()
                        for chunk in response.iter_content(1024 * 1024):
                            if not chunk:
                                continue
                            stream.write(chunk)
                            offset += len(chunk)
                            if offset > EXPECTED['gzipBytes']:
                                raise DownloadError('BODY_TOO_LARGE')
                            if time.monotonic() - last > 10:
                                stream.flush()
                                emit('download-progress', downloadedBytes=offset, totalBytes=EXPECTED['gzipBytes'])
                                last = time.monotonic()
                        stream.flush()
                        os.fsync(stream.fileno())
                if offset == EXPECTED['gzipBytes']:
                    break
            except requests.RequestException:
                emit('download-retry', attempt=attempt, code='TRANSPORT_ERROR')
                if attempt == 6:
                    raise DownloadError('DOWNLOAD_TRANSPORT_FAILED') from None
                time.sleep(min(10, 2 ** attempt))
        if not partial.exists() or partial.stat().st_size != EXPECTED['gzipBytes'] or file_digest(partial) != EXPECTED['gzipSha256']:
            raise DownloadError('GZIP_DIGEST_MISMATCH')
        partial.replace(target)
        os.chmod(target, 0o600)
    download_seconds = time.time() - download_started
    emit('gzip-verified', sha256=EXPECTED['gzipSha256'], bytes=EXPECTED['gzipBytes'], seconds=round(download_seconds, 3))
    source = DATA / 'resources.sqlite'
    plain_partial = DATA / 'resources.sqlite.partial'
    decompress_started = time.time()
    if source.exists():
        if source.stat().st_size != EXPECTED['sourceBytes'] or file_digest(source) != EXPECTED['sourceSha256']:
            raise DownloadError('EXISTING_SQLITE_MISMATCH')
    else:
        digest = hashlib.sha256()
        size = 0
        fd = os.open(plain_partial, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with gzip.open(target, 'rb') as compressed, os.fdopen(fd, 'wb') as plain:
            while chunk := compressed.read(4 * 1024 * 1024):
                size += len(chunk)
                if size > EXPECTED['sourceBytes']:
                    raise DownloadError('SQLITE_TOO_LARGE')
                digest.update(chunk)
                plain.write(chunk)
            plain.flush()
            os.fsync(plain.fileno())
        if size != EXPECTED['sourceBytes'] or digest.hexdigest() != EXPECTED['sourceSha256']:
            raise DownloadError('SQLITE_DIGEST_MISMATCH')
        plain_partial.replace(source)
    os.chmod(source, 0o600)
    decompress_seconds = time.time() - decompress_started
    emit('sqlite-verified', sha256=EXPECTED['sourceSha256'], bytes=EXPECTED['sourceBytes'], seconds=round(decompress_seconds, 3))
    report = {'status': 'verified', **EXPECTED, 'counts': ticket.get('counts'), 'downloadSeconds': round(download_seconds, 3),
              'decompressSeconds': round(decompress_seconds, 3), 'totalSeconds': round(time.time() - started, 3), 'completedEndpoint': False}
    private_write(REPORT, json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    try:
        response = session.post(urljoin(ticket['url'], '/complete'), json={'sha256': EXPECTED['gzipSha256']}, timeout=(15, 30), verify=str(ca_path), allow_redirects=False)
        if response.status_code != 204:
            raise DownloadError('COMPLETE_HTTP_' + str(response.status_code))
    except requests.RequestException:
        raise DownloadError('COMPLETE_RESULT_UNKNOWN') from None
    report['completedEndpoint'] = True
    report['totalSeconds'] = round(time.time() - started, 3)
    private_write(REPORT, json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    emit('complete', **report)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('failed', code=str(error) if isinstance(error, DownloadError) else type(error).__name__)
        raise SystemExit(1) from None
