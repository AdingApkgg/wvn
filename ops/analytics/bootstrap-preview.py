from pathlib import Path
import http.client,json,os,secrets,socket,time,uuid
# 仅初始化本轮独立预览。管理凭据和临时令牌始终留在 Arch，不写到 stdout。
os.umask(0o077)
assert socket.gethostname()=='arch'
state=Path('/home/wvn/wvn-renpy-source-preview-20261026/state/analytics')
assert (state/'private.env').exists() and not (state/'bootstrap.json').exists()
private=state/'admin.json'
if private.exists():credentials=json.loads(private.read_text())
else:
 credentials={'username':'admin','password':secrets.token_urlsafe(40),'websiteId':str(uuid.uuid4())};private.write_text(json.dumps(credentials));private.chmod(0o600)
def request(method,path,body=None,token=None):
 c=http.client.HTTPConnection('127.0.0.1',18561,timeout=10);headers={'content-type':'application/json'}
 if token:headers['authorization']='Bearer '+token
 c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();raw=r.read();status=r.status;c.close()
 try:data=json.loads(raw)
 except ValueError:data=None
 return status,data
for _ in range(50):
 try:
  if request('GET','/api/heartbeat')[0]==200:break
 except OSError:pass
 time.sleep(1)
else:raise RuntimeError('Umami preview did not become healthy')
status,login=request('POST','/api/auth/login',{'username':credentials['username'],'password':credentials['password']})
if status!=200:
 status,login=request('POST','/api/auth/login',{'username':'admin','password':'umami'});assert status==200,'Initial local administrator login failed'
 status,_=request('POST','/api/me/password',{'currentPassword':'umami','newPassword':credentials['password']},login['token']);assert status==200,'Default password replacement failed'
 status,login=request('POST','/api/auth/login',{'username':'admin','password':credentials['password']});assert status==200,'Private administrator login failed'
token=login['token'];(state/'qa-token').write_text(token);(state/'qa-token').chmod(0o600)
status,websites=request('GET','/api/websites',token=token);assert status==200
items=websites if isinstance(websites,list) else websites.get('data',[])
if not any(w.get('id')==credentials['websiteId'] for w in items):
 status,created=request('POST','/api/websites',{'name':'WVN — 远程预览','domain':'localhost','id':credentials['websiteId']},token);assert status==200,'Preview website creation failed'
 assert created.get('id')==credentials['websiteId']
assert request('POST','/api/auth/login',{'username':'admin','password':'umami'})[0]==401,'Default password still works'
assert request('GET','/api/websites')[0]==401,'Anonymous management access unexpectedly allowed'
report={'status':'configured','websiteId':credentials['websiteId'],'adminBind':'127.0.0.1:18561','defaultPasswordDisabled':True,'anonymousManagementStatus':401,'credentialsStayedOnArch':True,'productionChanged':False,'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
(state/'bootstrap.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
