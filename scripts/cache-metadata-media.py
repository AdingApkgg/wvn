"""Bounded proxy downloads of reviewed provider images; manifest import remains a separate step."""
import urllib.request,urllib.parse,json,pathlib,os,concurrent.futures,time
ROOT=pathlib.Path(__file__).resolve().parents[1];MEDIA=ROOT/'media';MEDIA.mkdir(exist_ok=True)
PROXY=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or 'http://127.0.0.1:11090'
def trusted(url):
 u=urllib.parse.urlsplit(url)
 return u.scheme=='https' and not u.username and not u.password and not u.port and u.hostname in ['t.vndb.org','lain.bgm.tv']
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if not trusted(newurl):raise ValueError('Untrusted image redirect')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
def download(image):
 url=image['sourceUrl'];name=pathlib.Path(image['url']).stem
 if not trusted(url):return url,None,'Untrusted source'
 for ext in ['jpg','png','webp']:
  file=MEDIA/(name+'.'+ext)
  if file.exists() and file.stat().st_size>0:return url,'/media/'+file.name,None
 for attempt in range(2):
  try:
   op=urllib.request.build_opener(urllib.request.ProxyHandler({'http':PROXY,'https':PROXY}),Redirect())
   with op.open(urllib.request.Request(url,headers={'User-Agent':'WG-Catalog-Metadata/0.1 (https://wg.saop.cc)'}),timeout=35) as res:
    raw=res.read(3*1024*1024+1)
   if len(raw)>3*1024*1024:raise ValueError('Image exceeds 3 MiB')
   ext='jpg' if raw.startswith(b'\xff\xd8\xff') else 'png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else 'webp' if raw[:4]==b'RIFF' and raw[8:12]==b'WEBP' else None
   if not ext:raise ValueError('Unsupported image bytes')
   file=MEDIA/(name+'.'+ext);file.write_bytes(raw);return url,'/media/'+file.name,None
  except Exception as e:
   if attempt: return url,None,str(e)
   time.sleep(1)
def main():
 doc=json.loads((ROOT/'data/metadata-plan.json').read_text());images={}
 for w in doc['works']:
  for i in ([w['cover']] if w['cover'] else [])+w['screenshots']:images[i['sourceUrl']]=i
 results={};errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for n,(url,path,error) in enumerate(pool.map(download,images.values()),1):
   results[url]=path
   if error:errors.append({'sourceUrl':url,'error':error})
   if n%20==0:print('media',n,'/',len(images),flush=True)
 for w in doc['works']:
  def cached(i):
   if i and results.get(i['sourceUrl']):return {**i,'url':results[i['sourceUrl']]}
   return None
  had=w['cover'];w['cover']=cached(had);w['screenshots']=[c for i in w['screenshots'] if (c:=cached(i))]
  if had and not w['cover']:w['warnings'].append('封面缓存失败，暂用占位图。')
 (ROOT/'data/metadata.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
 report={'generatedAt':doc['fetchedAt'],'works':len(doc['works']),'covers':sum(bool(w['cover']) for w in doc['works']),'screenshots':sum(len(w['screenshots']) for w in doc['works']),'descriptions':sum(bool(w['description']) for w in doc['works']),'taggedWorks':sum(bool(w['tags']) for w in doc['works']),'images':len(images),'downloaded':sum(bool(p) for p in results.values()),'errors':errors}
 (ROOT/'data/metadata-media-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
