"""核验候选 Python 运行时与旧游戏包解包的版本边界。"""
from pathlib import Path
import importlib.util,io,json,sys,tarfile,tempfile,unittest,zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/lib'))
spec=importlib.util.spec_from_file_location('wvn_renpy_adapter',Path(__file__).resolve().parents[1]/'scripts/lib/renpy-build.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
class RuntimeTest(unittest.TestCase):
 def test_unpack_keeps_pinned_runtime_and_extracts_only_game_resources(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'site3.py';p.write_text('def unpack(zf,infolist):\n    for i, zi in enumerate(infolist):\n        zf.extract(zi, "/")\n')
   adapter.patch_web_unpack(p)
   ns={};exec(p.read_text(),ns)
   class Fake:
    def __init__(self):self.names=[]
    def extract(self,zi,destination):self.names.append(zi.filename)
   z=Fake();names=['game/script.rpyc','renpy/config.py','../renpy/config.py','lib/python3.11/sitecustomize.py','pygame_sdl2/__init__.py','game/python-packages/custom.py']
   ns['unpack'](z,[zipfile.ZipInfo(n) for n in names]);self.assertEqual(z.names,['game/script.rpyc','game/python-packages/custom.py'])
   with self.assertRaises(ValueError):adapter.patch_web_unpack(p)
 def test_installed_runtime_comes_from_captured_source_not_generated_or_game_files(self):
  with tempfile.TemporaryDirectory() as d:
   r=Path(d);sources=r/'sources';sources.mkdir();dist=r/'dist';dist.mkdir();version=r/'vc_version.py';version.write_text('official = False\n')
   for name in ['renpy','pygame_sdl2']:
    with tarfile.open(sources/(name+'-'+'a'*40+'.tar'),'w') as out:
     data=(b'max_texture_size = (4096,4096)\n' if name=='renpy' else b'pinned=True\n');prefix='renpy/renpy/' if name=='renpy' else 'pygame_sdl2/src/pygame_sdl2/';i=tarfile.TarInfo(prefix+'config.py');i.size=len(data);out.addfile(i,io.BytesIO(data))
   with tarfile.open(sources/('renpy-build-'+'b'*40+'.tar'),'w'):pass
   receipt=adapter.install_runtime(sources,dist,version)
   self.assertIn('max_texture_size',(dist/'renpy/config.py').read_text());self.assertTrue((dist/'pygame_sdl2/config.py').exists());self.assertEqual((dist/'renpy/vc_version.py').read_text(),version.read_text());self.assertEqual(len(receipt['files']),3)
if __name__=='__main__':unittest.main()
