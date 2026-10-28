import {PgDatabase} from '../../src/database/postgres.ts';
import {WorkStatsStore} from '../../src/accounts/work-stats.server.ts';
const db=new PgDatabase(process.env.WVN_TEST_DATABASE_URL,{schema:process.env.WVN_TEST_SCHEMA});
const stats=new WorkStatsStore(db,[{id:'v1',title:'One',url:'/1/',versions:[{id:'version-1',number:1,title:'A',engine:'ONS',url:'/1/1/'}]}],()=>1000);
process.send({type:'ready'});process.once('message',async()=>{const result=await stats.read('v1','version-1','a'.repeat(64));process.send({type:'result',counted:result.counted},async()=>{await db.close();process.disconnect()})});
