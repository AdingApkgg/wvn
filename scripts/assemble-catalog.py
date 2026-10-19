"""Assemble reviewed VNDB mappings and explicit Bangumi fallback mappings only."""
import json,pathlib,hashlib,urllib.parse,collections
root=pathlib.Path(__file__).resolve().parents[1]
legacy=json.loads((root/'data/legacy-catalog.json').read_text())
# Rows preserve exact original order. None is an explicit unresolved work, never a synthetic VNDB ID.
ids=[27448,4,97,18636,1194,1286,1085,26310,32805,30216,
8038,8038,14240,14240,14365,14365,14365,27057,27057,27057,44184,44184,44184,44184,
33099,33969,28666,7738,10597,8158,6589,33206,9303,13190,14805,
11071,11071,11071,19182,19182,19182,12246,33205,27449,27457,
36554,36555,36556,36557,36558,44249,49795,22899,23741,50789,29443,8436,2968,22847,20431,562,562,
None,33206,15637,45247,34848,27436,25170,3770,3144,1115,32183,5922,10680,18148,19841,182,37843]
assert len(ids)==len(legacy['entries'])==79
cache=json.loads((root/'data/vndb-search-cache.json').read_text());evidence={v['id']:v for x in cache.values() for v in x.get('results',[])}
# Earlier seed query contains ATRI exact match despite broad current query pagination.
for v in json.load(open(root/'data/vndb-initial-seeds.json'))['results']:evidence.setdefault(v['id'],v)
works={};versions=[];pending=[];counts=collections.Counter()
notes={55:'Actual index.html title identifies Tsui no Stella after-story; separate VNDB work.',63:'配置确认为 にーとと天使とえっちな家族；Bangumi 作者列表记载 PC / 3D、2020-03-06、开发 にじいろばんび，尚无核实的 VNDB ID。',66:'Archive metadata script filename identifies アイコトバ2; system metadata and VNDB sequel title cross-check.',67:'Archive configuration identifies アマナツ; VNDB title and aliases cross-check.'}
for i,(n,card) in enumerate(zip(ids,legacy['entries']),1):
 path=urllib.parse.unquote(card['href']);uuid='legacy-'+hashlib.sha256(path.encode()).hexdigest()[:24]
 if n is None and i == 63:
  works['b315601']={'id':'b315601','title':'尼特与天使与色色家族','originalTitle':'にーとと天使とえっちな家族','aliases':['死宅天使','にーとと天使とえっちな家族'],'evidence':'https://bgm.tv/subject/315601'}
  versions.append({'id':uuid,'workId':'b315601','number':1,'title':card['title'],'legacyPath':path,'engine':'Tyrano','mappingNote':notes[i]+' 用户授权使用已核实 Bangumi 编号兜底。'})
  continue
 if n is None:pending.append({'id':uuid,**card,'legacyPath':path,'reason':notes.get(i,'Unresolved identity'),'bangumiId':315601,'bangumiEvidence':'https://bangumi.tv/person/43634/works/game'});continue
 vnid='v'+str(n);vn=evidence[vnid];counts[vnid]+=1
 if vnid not in works:
  title=card['title'].split(' · ')[0] if '万华镜系列' not in card['title'] else card['title'].split(' · ')[1].split(' ')[0]
  if vnid.startswith('v365') or vnid in ['v44249','v49795']:title=card['title'].split(' · ')[-1][1:]
  if vnid=='v50789':title='星之终途后日谈：渺茫希望的日记'
  if vnid=='v45247':title='爱语 -Silver Snow Sister-'
  aliases=list(dict.fromkeys(vn['aliases']+[t['title'] for t in vn.get('titles',[])]+[card['title']]))
  works[vnid]={'id':vnid,'title':title,'originalTitle':vn.get('alttitle') or vn['title'],'aliases':aliases,'evidence':'https://vndb.org/'+vnid}
 engine='ONS' if 'ONSCRIPTER' in card['meta'] else 'Artemis' if 'ARTEMIS' in card['meta'] else 'RenPy' if 'REN' in card['meta'] else 'Tyrano'
 versions.append({'id':uuid,'workId':vnid,'number':counts[vnid],'title':card['title'],'legacyPath':path,'engine':engine,'mappingNote':notes.get(i,'Exact source title, translated title or established alias checked against VNDB API record')})
seed={'snapshotAt':legacy['checkedAt'],'works':list(works.values()),'versions':versions,'pending':pending}
(root/'data/catalog.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2)+'\n')
prior=json.loads((root/'data/vndb-evidence.json').read_text())
(root/'data/vndb-evidence.json').write_text(json.dumps({id:prior.get(id,{**evidence[id],'api':'https://api.vndb.org/kana/vn','reviewedOn':'2026-10-19'}) for id in works if id.startswith('v')},ensure_ascii=False,indent=2)+'\n')
print(len(works),'works',len(versions),'mapped versions',len(pending),'unresolved')
