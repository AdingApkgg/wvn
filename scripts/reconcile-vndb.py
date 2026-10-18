"""Read-only metadata research. Always uses configured proxy; never selects a first hit."""
import json, pathlib, subprocess, time
base=pathlib.Path(__file__).resolve().parents[1]
queries=['Niito','ニート','Tenshi to Ecchi','Ecchi na Kazoku','Neet to Tenshi','にーと','Bambi Project','Aikotoba Silver','にーとと天使とえっちな家族','Ai Kotoba','Aikagi','Aibeya','Amakano','Amanatsu','Princess×Princess','Harmonia','星之终途','星之旅途 后日谈','死宅天使','天使纷扰','爱言','Aikotoba','繁花落舞恋如樱','Chiisana Kanojo no Serenade','小小的爱情公寓',
'Saya no Uta','Teaching Feeling','Yosuga no Sora','3days','NinNinDays','NinNinDays2','Princess Princess',
'Bishoujo Mangekyou','Hokenshitsu no Sensei','Kimi to Kanojo to Kanojo no Koi','Natsuzora no Perseus','Daitoshokan no Hitsujikai','Josou Sanmyaku',
'妹妹母亲','Imouto Choukyou Nikki','Chiisana Kanojo no Serenade','Otome Riron to Sono Shuuhen','Adabana Itan',
'这份恋情','Nukitashi','Hoshi no Owari','是谁杀了知更鸟','Hoshizora e Kakaru Hashi','Raspberry Cube','Sakura no Toki','Sakura no Uta',
'死宅天使','母性萝莉','Soreyori no Prologue','爱语','Amanatsu','真实动漫情境体验','神社里的猫巫女','Aiyoku no Eustia','Subarashiki Hibi','Hana Sakiharu','绘缘蜜恋','Kara no Shoujo','Tsuki ni Yorisou Otome no Sahou','Nora to Oujo','Kono Aozora ni Yakusoku','Asuka-san wa Nabikanai',
'ATRI','CLANNAD','eden*','Hamidashi Creative'
]
cache=base/'data/vndb-search-cache.json'
out=json.loads(cache.read_text()) if cache.exists() else {}
for q in queries:
 if q in out:continue
 body=json.dumps({'filters':['search','=',q],'fields':'title,alttitle,aliases,titles.title,titles.latin,released','results':100},ensure_ascii=False)
 for attempt in range(4):
  r=subprocess.run(['curl','--silent','--show-error','--fail-with-body','--max-time','45','--proxy','http://127.0.0.1:10808','https://api.vndb.org/kana/vn','-H','Content-Type: application/json','--data-binary',body],capture_output=True,text=True)
  if r.returncode==0:
   try:out[q]=json.loads(r.stdout);break
   except ValueError:pass
  print('retry',q,attempt,r.stderr[:80],flush=True);time.sleep(20*(attempt+1))
 else:print('FAILED',q,flush=True);continue
 cache.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(q, len(out[q].get('results',[])), 'more='+str(out[q].get('more')),flush=True)
 time.sleep(1.5)
