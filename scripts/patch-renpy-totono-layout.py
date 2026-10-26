"""修正 TTN 旧移植存档网格中的三种整数除法；不反序列化或执行游戏对象。"""
import collections,hashlib,json,pickletools,struct,zlib

REPLACEMENTS={f'savey = {name} / 5':f'savey = {name}// 5' for name in ('i','id','trueid')}

def patch_layout(data):
    if not data.startswith(b'RENPY RPC2'):raise ValueError('Unexpected RPYC format')
    entries=[]
    for pos in range(10,min(len(data),1024),12):
        slot,offset,length=struct.unpack_from('<III',data,pos)
        if not slot:break
        if offset+length>len(data):raise ValueError('Invalid RPYC section')
        entries.append((slot,data[offset:offset+length]))
    if not entries or entries[0][0]!=1:raise ValueError('Missing AST section')
    selected=next((i for i,(slot,_) in enumerate(entries) if slot==2),0)
    trailer=data[max(struct.unpack_from('<III',data,10+12*i)[1]+len(chunk) for i,(_,chunk) in enumerate(entries)):]
    payload=zlib.decompress(entries[selected][1]);assert len(payload)<8*1024**2
    operations=list(pickletools.genops(payload));changes=[];counts=collections.Counter()
    for index,(op,arg,pos) in enumerate(operations):
        if op.name not in ('BINUNICODE','SHORT_BINUNICODE','UNICODE') or arg not in REPLACEMENTS:continue
        end=operations[index+1][2];segment=payload[pos:end];old=arg.encode();new=REPLACEMENTS[arg].encode()
        if len(old)!=len(new) or segment.count(old)!=1:raise ValueError('Ambiguous source encoding')
        changes.append((pos,end,segment.replace(old,new)));counts[arg]+=1
    if set(counts)!=set(REPLACEMENTS) or any(n>4 for n in counts.values()):raise ValueError('Unexpected layout source expressions: '+str(counts))
    updated=payload
    for start,end,replacement in reversed(changes):updated=updated[:start]+replacement+updated[end:]
    list(pickletools.genops(updated))
    entries[selected]=(entries[selected][0],zlib.compress(updated));offset=10+12*(len(entries)+1);header=b'RENPY RPC2';chunks=[]
    for slot,chunk in entries:header+=struct.pack('<III',slot,offset,len(chunk));chunks.append(chunk);offset+=len(chunk)
    if len(trailer)!=16:raise ValueError('Unexpected RPYC cache marker')
    cache_marker=hashlib.md5(updated).digest()
    result=header+b'\0'*12+b''.join(chunks)+cache_marker
    return result,{'expressions':dict(counts),'patchedSection':entries[selected][0],'changedExpressions':len(changes),'originalSHA256':hashlib.sha256(data).hexdigest(),'patchedSHA256':hashlib.sha256(result).hexdigest(),'otherSectionsUnchanged':True,'cacheMarkerUpdated':cache_marker!=trailer,'originalCacheMarker':trailer.hex(),'cacheMarker':cache_marker.hex()}

if __name__=='__main__':
    from pathlib import Path
    import sys
    source,target=map(Path,sys.argv[1:3])
    if target.exists():raise SystemExit('Output already exists')
    patched,receipt=patch_layout(source.read_bytes());target.write_bytes(patched);target.with_suffix('.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
