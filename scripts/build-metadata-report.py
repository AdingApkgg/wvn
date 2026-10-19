import pathlib,json
r=pathlib.Path(__file__).resolve().parents[1];c=json.loads((r/'data/metadata-collected.json').read_text());d=json.loads((r/'data/metadata.json').read_text())
report={'fetchedAt':c['fetchedAt'],'vndbFetched':len(c['vndb']),'bangumiFetched':len(c['bangumi']),'crossMatches':c['matches'],'unmatched':c['candidates'],'failures':c['failures'],'alternativeCovers':{k:{'id':v['id'],'releaseId':v['releaseId'],'url':v['url']} for k,v in c.get('alternativeCovers',{}).items()},'missing':{k:[w['workId'] for w in d['works'] if not w[k]] for k in ['cover','description','tags','screenshots']}}
report['snapshotFetchedAt']=d['fetchedAt']
report['coverKinds']={kind:sum(bool(w['cover']) and w['cover'].get('kind','original')==kind for w in d['works']) for kind in ['original','promotion','logo','screenshot']}
supplements=r/'data/metadata-supplements.json'
if supplements.exists():
 items=json.loads(supplements.read_text())['items'];works={w['workId']:w for w in d['works']}
 report['reviewedSupplements']=[{'workId':i['workId'],'coverApplied':bool(i.get('cover')) and works[i['workId']]['cover'] is not None and works[i['workId']]['cover']['sourceUrl']==i['cover']['sourceUrl'],'descriptionApplied':bool(i.get('description')) and works[i['workId']]['description']==i['description'],'sources':i['sources']} for i in items]
(r/'data/metadata-match-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
