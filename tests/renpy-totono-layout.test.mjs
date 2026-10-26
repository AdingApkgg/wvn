import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('TTN layout patch changes only audited source expressions and retains other RPYC sections',()=>{
 const script=`import runpy,pickle,zlib,struct,hashlib
patch=runpy.run_path('scripts/patch-renpy-totono-layout.py')['patch_layout']
values=['savey = i / 5','savey = i / 5','savey = id / 5','savey = trueid / 5','volume / 5']
ast=zlib.compress(pickle.dumps(values,protocol=2));metadata=b'unchanged metadata';trailer=b'original-trailer';offset=58
source=b'RENPY RPC2'+struct.pack('<III',1,offset,len(ast))+struct.pack('<III',2,offset+len(ast),len(ast))+struct.pack('<III',3,offset+2*len(ast),len(metadata))+b'\\0'*12+ast+ast+metadata+trailer
result,proof=patch(source)
assert proof['changedExpressions']==3 and proof['otherSectionsUnchanged']
slot,off,n=struct.unpack_from('<III',result,10);assert result[off:off+n]==ast
slot,off,n=struct.unpack_from('<III',result,22);assert slot==2 and proof['patchedSection']==2
# 只有本测试自产的数据允许反序列化；真实游戏只解析 pickle 指令。
updated=pickle.loads(zlib.decompress(result[off:off+n]))
assert updated==['savey = i// 5','savey = i// 5','savey = id// 5','savey = trueid// 5','volume / 5']
slot,off,n=struct.unpack_from('<III',result,34);assert slot==3 and result[off:off+n]==metadata and not result.endswith(trailer) and proof['cacheMarkerUpdated']
slot,off,n=struct.unpack_from('<III',result,22);assert b'volume / 5' in zlib.decompress(result[off:off+n]);assert result[-16:]==hashlib.md5(zlib.decompress(result[off:off+n])).digest()
for i in range(20):
 row=i//5;position=83+110*row
 assert isinstance(position,int) and 83<=position<=413
assert 83+110*(0/5)==83.0
try:patch(b'not an archive')
except ValueError:pass
else:raise AssertionError('Invalid input accepted')
`;
 const result=spawnSync('python3',['-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
