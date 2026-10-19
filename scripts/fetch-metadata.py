"""Read-only source collection. No database writes or credentials. Run on the build host."""
import json,pathlib,urllib.request,urllib.error,time,unicodedata,re,os,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'data/metadata-sources';CACHE.mkdir(parents=True,exist_ok=True)
PROXY=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or 'http://127.0.0.1:11090'
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({'http':PROXY,'https':PROXY}))
UA='WG-Catalog-Metadata/0.1 (personal remote preview; https://wg.saop.cc)'
def api(url,body=None):
 data=None if body is None else json.dumps(body,ensure_ascii=False).encode()
 req=urllib.request.Request(url,data,headers={'User-Agent':UA,'Content-Type':'application/json','Accept':'application/json'})
 for attempt in range(3):
  try:
   with OPENER.open(req,timeout=45) as res:return json.load(res)
  except urllib.error.HTTPError as e:
   if e.code in [429,500,502,503,504] and attempt<2:time.sleep(min(45,10*(attempt+1)));continue
   raise
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
   time.sleep(3)
def save(file,value):file.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def norm(value):return re.sub(r'[^\w]', '',unicodedata.normalize('NFKC',value).casefold())
def compatible(a,b):
 if not a or not b or a=='TBA' or b=='TBA':return False
 if a.startswith(b) or b.startswith(a):return True
 try:return abs((datetime.date.fromisoformat(a)-datetime.date.fromisoformat(b)).days)<=1
 except ValueError:return False
def collect():
 seed=json.loads((ROOT/'data/catalog.json').read_text());vns={};fail=[];bgm={};matches={};candidates=[]
 ids=[w['id'] for w in seed['works'] if w['id'].startswith('v')]
 fields='title,alttitle,titles{lang,title,official,main},aliases,description,released,languages,platforms,rating,votecount,length_minutes,developers{id,name,original},image{id,url,thumbnail,dims,sexual,violence,votecount},screenshots{id,url,thumbnail,dims,sexual,violence,votecount},tags{id,name,category,rating,spoiler,lie}'
 for n in range(0,len(ids),5):
  batch=ids[n:n+5];missing=[]
  for id in batch:
   f=CACHE/(id+'.json')
   if f.exists():vns[id]=json.loads(f.read_text())
   else:missing.append(id)
  if missing:
   filters=['id','=',missing[0]] if len(missing)==1 else ['or']+[['id','=',x] for x in missing]
   try:
    data=api('https://api.vndb.org/kana/vn',{'filters':filters,'fields':fields,'results':10})
    for v in data['results']:vns[v['id']]=v;save(CACHE/(v['id']+'.json'),v)
    time.sleep(2)
   except Exception as e:fail.append({'provider':'vndb','ids':missing,'error':str(e)})
  print('VNDB',min(n+5,len(ids)),'/',len(ids),flush=True)
 for i,w in enumerate(seed['works']):
  if w['id'].startswith('b'):
   id=int(w['id'][1:]);matches[w['id']]={'id':id,'method':'existing-reviewed-bangumi-id'}
  else:
   v=vns.get(w['id']);
   if not v:continue
   queries=list(dict.fromkeys([v.get('alttitle'),v['title'],re.sub(r'[^\w\s]',' ',v['title']).strip(),w['title']]))
   names={norm(x) for x in [v['title'],v.get('alttitle','')]+[t['title'] for t in v.get('titles',[])] if x}
   found={};checked=[]
   for query in queries:
    if not query:continue
    f=CACHE/(w['id']+'-bgm-search-'+str(queries.index(query))+'.json')
    try:
     if f.exists():data=json.loads(f.read_text())
     else:data=api('https://api.bgm.tv/v0/search/subjects?limit=20',{'keyword':query,'sort':'match','filter':{'type':[4]}});save(f,data);time.sleep(.6)
     for c in data.get('data',[]):
      titleMatch=bool(names & {norm(c.get('name','')),norm(c.get('name_cn',''))})
      dateMatch=compatible(v.get('released'),c.get('date'))
      if c.get('type')==4 and titleMatch and dateMatch:found[c['id']]=c
     checked.extend({'id':c['id'],'name':c.get('name'),'date':c.get('date')} for c in data.get('data',[])[:4])
    except Exception as e:fail.append({'provider':'bgm-search','workId':w['id'],'error':str(e)})
   if len(found)==1:
    id=next(iter(found));matches[w['id']]={'id':id,'method':'unique-exact-title-and-release-date-within-one-day','vndbTitle':v['title'],'releaseDate':v.get('released')}
   else:
    candidates.append({'workId':w['id'],'status':'ambiguous' if len(found)>1 else 'unmatched-public-api','candidates':checked});print('BGM',i+1,'/',len(seed['works']),'unmatched',flush=True);continue
  f=CACHE/('b'+str(id)+'.json')
  try:
   if f.exists():data=json.loads(f.read_text())
   else:data=api('https://api.bgm.tv/v0/subjects/'+str(id));save(f,data);time.sleep(.6)
   if data.get('id')!=id or data.get('type')!=4:raise ValueError('Subject identity/type mismatch')
   bgm[w['id']]=data
  except Exception as e:fail.append({'provider':'bgm','workId':w['id'],'id':id,'error':str(e)})
  print('BGM',i+1,'/',len(seed['works']),'matched',id,flush=True)
 result={'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'vndb':vns,'bangumi':bgm,'matches':matches,'candidates':candidates,'failures':fail}
 save(ROOT/'data/metadata-collected.json',result)
 print(json.dumps({'vndb':len(vns),'bangumi':len(bgm),'matches':len(matches),'unmatched':len(candidates),'failures':fail},ensure_ascii=False),flush=True)
if __name__=='__main__':collect()
