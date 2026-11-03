"""在远程持久任务中采集 VNDB 逐图评分证据，不下载图片或游戏资源。"""
import datetime
import json
import os
import pathlib
import urllib.request
import urllib.error

if not (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')):
    raise SystemExit('缺少已配置代理，拒绝联网采集')
if not os.environ.get('TMUX'):
    raise SystemExit('必须在远程持久任务中运行')
root = pathlib.Path(__file__).resolve().parent.parent
metadata = json.loads((root / 'data/metadata.json').read_text())
ids = [w['workId'] for w in metadata['works'] if w['workId'].startswith('v')]
fields = 'id,image.id,image.url,image.sexual,image.violence,image.votecount,screenshots.id,screenshots.url,screenshots.sexual,screenshots.violence,screenshots.votecount'
query = {'filters': ['or', *[['id', '=', ident] for ident in ids]], 'fields': fields, 'results': 100}
request = urllib.request.Request('https://api.vndb.org/kana/vn', data=json.dumps(query).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'WVN-content-classification/1.0'})
try:
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.load(response)
except urllib.error.HTTPError as error:
    print(error.read().decode('utf-8')[:2000])
    raise SystemExit('官方API拒绝了查询，未生成证据文件') from None
if result.get('more') or len(result.get('results', [])) != len(ids):
    raise SystemExit('作品查询未完整返回，请保留日志并核对')
output = {'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': 'https://api.vndb.org/kana/vn', 'query': query, 'response': result}
target = root / 'data/content-image-evidence.json'
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'作品': len(ids), '证据文件': str(target)}, ensure_ascii=False))
