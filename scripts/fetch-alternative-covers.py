"""Get clean front covers from releases of the exact same VN; bundles require image-specific identity."""
import importlib.util,json,pathlib,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fetcher',ROOT/'scripts/fetch-metadata.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
doc=json.loads((ROOT/'data/metadata-collected.json').read_text());needed=[k for k,v in doc['vndb'].items() if not v.get('image') or v['image']['sexual']!=0 or v['image']['violence']!=0]
alts={};fail=[]
for n in range(0,len(needed),5):
 batch=needed[n:n+5];pred=['id','=',batch[0]] if len(batch)==1 else ['or']+[['id','=',k] for k in batch]
 for page in range(1,5):
  key=m.CACHE/('release-covers-'+str(n)+'-'+str(page)+'.json')
  try:
   if key.exists():data=json.loads(key.read_text())
   else:data=m.api('https://api.vndb.org/kana/release',{'filters':['and',['vn','=',pred],['official','=',1]],'fields':'title,vns.id,images{id,url,dims,sexual,violence,votecount,type,vn,photo}','results':100,'page':page});m.save(key,data);time.sleep(2)
   for rel in data['results']:
    ids=[v['id'] for v in rel['vns']]
    for image in rel.get('images',[]):
     id=image.get('vn') or (ids[0] if len(ids)==1 else None)
     if id in batch and image['type'] in ['pkgfront','dig'] and not image.get('photo') and image['sexual']==0 and image['violence']==0 and min(image.get('dims',[0]))>=200:
      ratio=image['dims'][0]/image['dims'][1]
      if .45<=ratio<=1.8:alts.setdefault(id,[]).append({**image,'releaseId':rel['id']})
   if not data['more']:break
  except Exception as e:fail.append({'ids':batch,'error':str(e)});break
 print('alternative covers',min(n+5,len(needed)),'/',len(needed),flush=True)
doc['alternativeCovers']={k:sorted(v,key=lambda x:x['dims'][0]*x['dims'][1],reverse=True)[0] for k,v in alts.items()}
doc['alternativeCoverFailures']=fail;m.save(ROOT/'data/metadata-collected.json',doc)
print(json.dumps({'recovered':len(alts),'failures':fail}),flush=True)
