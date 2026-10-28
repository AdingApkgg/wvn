import {writeFileSync,readFileSync} from 'node:fs';
import {players} from '../../public/player/registry.mjs';
const media=JSON.parse(readFileSync(new URL('../../data/player-media-overrides.json',import.meta.url))).entries;
const document={games:Object.fromEntries(players.map(p=>[p.id,p.directory])),media:Object.fromEntries(media.map(r=>[r.id+'\0'+r.path.toLowerCase(),r.file]))};
writeFileSync(new URL('./public-assets.mjs',import.meta.url),'// 从公开播放器注册表和媒体清单生成，不包含账号或存档。\nexport default '+JSON.stringify(document,null,2)+';\n');
