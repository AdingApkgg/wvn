"""只为本任务隔离预览缓存已审核安全图片，不修改元数据或分类证据。"""
import concurrent.futures
import importlib.util
import json
import os
import pathlib
import socket
import ssl
import urllib.error
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
base = root.parent
if socket.gethostname() != 'localhost' or not os.environ.get('TMUX') or os.environ.get('WG_NSFW_ROOT') != str(root):
    raise RuntimeError('只允许本任务远程持久化目录')
owner = json.loads((base / 'private/owner.json').read_text())
if owner.get('task') != 'nsfw-20261104' or owner.get('root') != str(root):
    raise RuntimeError('预览归属不符')
spec = importlib.util.spec_from_file_location('reviewed_cache', root / 'scripts/cache-metadata-media.py')
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)
records = json.loads((root / 'data/content-classification.json').read_text())['records']
reviewed = {row['id'] for row in records if row['kind'] == 'image' and row['classification']['sexual'] == 'safe' and row['classification']['violence'] == 'tame'}
blocked = {row['id'] for row in records if row['kind'] == 'image'} - reviewed
images = {}
for work in json.loads((root / 'data/metadata.json').read_text())['works']:
    for image in [work.get('cover'), *work['screenshots']]:
        if image and image['url'] in reviewed:
            images[image['url']] = image

def download(image):
    _, path, error = cache.download(image)
    if error or path != image['url']:
        return {'path': image['url'], 'error': error or '媒体格式与已审核路径不一致'}
    return None

errors = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for index, error in enumerate(pool.map(download, images.values()), 1):
        if error:
            errors.append(error)
        if index % 40 == 0:
            print(f'已处理安全图片 {index}/{len(images)}', flush=True)

# 完整HEAD检查：安全媒体可读，未知/非安全媒体仍由服务端拒绝。
context = ssl.create_default_context(cafile=str(base / 'private/tls.crt'))
def status(path):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
    try:
        with opener.open(urllib.request.Request(owner['origin'] + path, method='HEAD'), timeout=8) as response:
            return response.status, response.headers.get('content-type', '')
    except urllib.error.HTTPError as error:
        return error.code, ''

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for path, (code, mime) in zip(sorted(reviewed), pool.map(status, sorted(reviewed))):
        if code != 200 or not mime.startswith('image/'):
            errors.append({'path': path, 'error': f'安全图片HEAD={code}'})
    for path, (code, _) in zip(sorted(blocked), pool.map(status, sorted(blocked))):
        if code != 403:
            errors.append({'path': path, 'error': f'受限图片HEAD={code}'})
report = {'safeImages': len(reviewed), 'blockedImages': len(blocked), 'errors': errors}
(base / 'private/media-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({**report, 'errors': len(errors)}, ensure_ascii=False), flush=True)
raise SystemExit(1 if errors else 0)
