"""在 Arch 原机核对独立 Umami 的实际入库与管理隔离，只输出汇总。"""
from pathlib import Path
import http.client,json,socket,subprocess,time

assert socket.gethostname()=='arch'
home=Path('/home/wvn/wvn-renpy-source-preview-20261026')
state=home/'state/analytics'
site=json.loads((state/'bootstrap.json').read_text())['websiteId']
assert site=='8551323c-76f9-462a-91ed-3d3dac53b2c3'
command=['docker','compose','--env-file',str(state/'private.env')]
def compose(*args):return subprocess.check_output(command+list(args),cwd=home/'ops/analytics',text=True)
raw=compose('ps','--format','json')
try:services=json.loads(raw)
except ValueError:services=[json.loads(line) for line in raw.splitlines() if line]
if isinstance(services,dict):services=[services]
assert {s['Service'] for s in services}=={'umami','postgres'}
for service in services:
 assert service['State']=='running' and service['Health']=='healthy'
 published=[p for p in service.get('Publishers',[]) if p.get('PublishedPort')]
 if service['Service']=='postgres':assert not published
 else:assert len(published)==1 and published[0]['URL']=='127.0.0.1' and published[0]['PublishedPort']==18561
def request(method,path,body=None):
 connection=http.client.HTTPConnection('127.0.0.1',18561,timeout=5)
 connection.request(method,path,json.dumps(body) if body else None,{'content-type':'application/json'})
 response=connection.getresponse();response.read();status=response.status;connection.close();return status
assert request('GET','/api/websites')==401
assert request('POST','/api/auth/login',{'username':'admin','password':'umami'})==401
query="""SELECT json_build_object(
 'events',count(*),
 'readingStarts',count(*) FILTER(WHERE event_name='reading_start'),
 'likes',count(*) FILTER(WHERE event_name='like'),
 'favorites',count(*) FILTER(WHERE event_name='favorite'),
 'privatePaths',count(*) FILTER(WHERE url_path LIKE '/account%' OR url_path LIKE '/s/%'),
 'queryOrReferrerLeaks',count(*) FILTER(WHERE coalesce(url_query,'')<>'' OR coalesce(referrer_query,'')<>'' OR coalesce(referrer_domain,'')<>''),
 'privateTitles',count(*) FILTER(WHERE page_title<>'WVN'),
 'unapprovedEvents',count(*) FILTER(WHERE coalesce(event_name,'') NOT IN ('','reading_start','like','favorite'))
) FROM website_event WHERE website_id='"""+site+"'"
counts=json.loads(compose('exec','-T','postgres','psql','-U','wvn_analytics_owner','-d','umami','-Atc',query))
assert all(counts[k]>0 for k in ['events','readingStarts','likes','favorites'])
assert all(counts[k]==0 for k in ['privatePaths','queryOrReferrerLeaks','privateTitles','unapprovedEvents'])
report={'status':'passed','websiteId':site,'counts':counts,'servicesHealthy':True,'databaseNotPublished':True,'adminLoopbackOnly':True,'anonymousManagementStatus':401,'defaultPasswordDisabled':True,'credentialsStayedOnArch':True,'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
target=Path('/home/wvn/wvn-renpy-stats-preview-20261026/state/analytics-verification.json');target.write_text(json.dumps(report,indent=2));print(json.dumps(report))
