import pathlib,json
r=pathlib.Path(__file__).resolve().parents[1];c=json.loads((r/'data/metadata-collected.json').read_text());d=json.loads((r/'data/metadata.json').read_text())
report={'fetchedAt':c['fetchedAt'],'vndbFetched':len(c['vndb']),'bangumiFetched':len(c['bangumi']),'crossMatches':c['matches'],'unmatched':c['candidates'],'failures':c['failures'],'alternativeCovers':{k:{'id':v['id'],'releaseId':v['releaseId'],'url':v['url']} for k,v in c.get('alternativeCovers',{}).items()},'missing':{k:[w['workId'] for w in d['works'] if not w[k]] for k in ['cover','description','tags','screenshots']}}
(r/'data/metadata-match-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
