"""接收 WG 资源到独立目录；校验原始字节、保留时间并记录可续传清单。"""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import time
import zlib

root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True, mode=0o700)
manifest = root / 'migration-manifest.json'
records = json.loads(manifest.read_text()) if manifest.exists() else {}
current = None
received = 0
last_report = 0
seen = set()

def destination(record):
    relative = PurePosixPath(record['path'])
    if relative.is_absolute() or any(p in ('..', '.', '') for p in relative.parts) or relative.parts[0] not in ('games', 'player-media', 'media'):
        raise ValueError('资源路径越界')
    target = root.joinpath(*relative.parts)
    if not target.resolve().is_relative_to(root):
        raise ValueError('资源指向目录外')
    if record['path'] in seen:
        raise ValueError('重复资源路径')
    seen.add(record['path'])
    return target

def save(status, **extra):
    temporary = manifest.with_suffix('.tmp')
    temporary.write_text(json.dumps(records, ensure_ascii=False))
    temporary.replace(manifest)
    report = {'status': status, 'verifiedFiles': len(records), 'verifiedBytes': sum(v['bytes'] for v in records.values()), 'current': current['path'] if current else None, 'updatedAt': time.time(), **extra}
    (root / 'migration-status.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))

try:
    for raw in sys.stdin.buffer:
        tag, payload = raw.rstrip(b'\r\n').split(b' ', 1)
        if tag == b'F':
            if current:
                raise ValueError('上一个文件尚未校验完成')
            current = json.loads(base64.b64decode(payload, validate=True))
            target = destination(current)
            if shutil.disk_usage(root).free < 62 * 1024 ** 3 + current['bytes']:
                raise ValueError('目标盘已达 60 GiB 加 2 GiB 缓冲红线')
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.wg-partial')
            output = temporary.open('wb')
            digest, decoder, length = hashlib.sha256(), zlib.decompressobj(31), 0
        elif tag == b'D':
            if not current:
                raise ValueError('缺少文件头')
            chunk = decoder.decompress(base64.b64decode(payload, validate=True))
            length += len(chunk)
            if length > current['bytes']:
                raise ValueError('解压后长度超出清单')
            digest.update(chunk)
            output.write(chunk)
            if time.time() - last_report > 15:
                save('transferring', currentBytes=length)
                last_report = time.time()
        elif tag == b'E':
            if not current or not decoder.eof or decoder.unused_data or length != current['bytes'] or digest.hexdigest() != payload.decode('ascii'):
                raise ValueError('资源长度或 SHA-256 校验失败')
            output.flush()
            os.fsync(output.fileno())
            output.close()
            os.utime(temporary, ns=(round(current['mtime'] * 1_000_000),) * 2)
            temporary.replace(target)
            records[current['path']] = {'bytes': length, 'mtime': current['mtime'], 'sha256': digest.hexdigest()}
            current = None
            received += 1
            if received % 50 == 0:
                save('transferring')
        elif tag == b'S':
            if current:
                raise ValueError('跳过校验与文件传输交错')
            record = json.loads(base64.b64decode(payload, validate=True))
            target = destination(record)
            try:
                if not target.is_file() or target.stat().st_size != record['bytes']:
                    raise ValueError('续传目标文件缺失或长度不同')
                sha = hashlib.sha256()
                with target.open('rb') as file:
                    for chunk in iter(lambda: file.read(1024 * 1024), b''):
                        sha.update(chunk)
                if sha.hexdigest() != record['sha256']:
                    raise ValueError('续传目标文件 SHA-256 不同')
                records[record['path']] = {key: record[key] for key in ('bytes', 'mtime', 'sha256')}
            except Exception:
                records.pop(record['path'], None)
                raise
        elif tag == b'Z':
            summary = json.loads(base64.b64decode(payload, validate=True))
            if current or set(records) != seen or summary['files'] != len(records) or summary['bytes'] != sum(v['bytes'] for v in records.values()):
                raise ValueError('完整资源清单数量不一致')
            save('complete', source=summary)
            print(json.dumps({'status': 'complete', 'files': len(records), 'bytes': summary['bytes']}, ensure_ascii=False))
            break
        elif tag == b'X':
            raise ValueError(json.loads(base64.b64decode(payload, validate=True))['error'])
        else:
            raise ValueError('未知传输记录')
    else:
        raise ValueError('连接提前结束，可根据已校验清单继续')
except Exception as error:
    if current and 'output' in globals():
        output.close()
    save('error', error=str(error))
    raise
