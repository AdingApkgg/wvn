import {DatabaseSync} from 'node:sqlite';
import {WorkStatsStore} from '../../src/accounts/work-stats.server.ts';
const db=new DatabaseSync(process.argv[2]);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
const stats=new WorkStatsStore(db,[{id:'v1',title:'One',url:'/1/',versions:[{id:'version-1',number:1,title:'A',engine:'ONS',url:'/1/1/'}]}],()=>1000);
process.send({type:'ready'});process.once('message',()=>{const result=stats.read('v1','version-1','a'.repeat(64));process.send({type:'result',counted:result.counted},()=>{db.close();process.disconnect()})});
