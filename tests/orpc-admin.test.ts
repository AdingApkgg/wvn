import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationUpdateSchema, classificationRecordSchema, adminWorkSchema, contentAdminUserSchema, moderationShareSchema, managementContract, moderationContract, dashboardContract } from '../src/api/contracts/admin.ts';

test('classification writes require the rendered work fingerprint and reject mismatched payloads', () => {
 const update={kind:'work',id:'v4',expectedRevision:0,payload:{reason:'已核对',source:'manual:review',reviewedAt:'2026-11-14T00:00:00Z',pageSuitability:'sfw'}};
 assert.equal(classificationUpdateSchema.safeParse(update).success,false);
 assert.equal(classificationUpdateSchema.safeParse({...update,expectedFingerprint:'a'.repeat(64)}).success,true);
 assert.equal(classificationUpdateSchema.safeParse({...update,kind:'version',expectedFingerprint:'a'.repeat(64)}).success,false);
 assert.equal(classificationRecordSchema.safeParse({kind:'version',id:'v',manual:false,classification:{reason:'',source:'manual:',reviewedAt:'',revision:0,sexualContent:'unknown',titleSafe:false}}).success,true);
});
test('admin catalog output validates nested versions instead of accepting arbitrary JSON', () => {
 const work={id:'v4',title:'作品',originalTitle:'Original',aliases:[],evidence:'https://vndb.org/v4',revision:0,defaultVersionId:null,url:'/4',versions:[]};
 assert.deepEqual(adminWorkSchema.parse(work),work);
 assert.equal(adminWorkSchema.safeParse({...work,versions:[{id:'version'}]}).success,false);
 assert.equal(adminWorkSchema.safeParse({...work,defaultVersionId:42}).success,false);
});
test('moderation output requires explicit nullable projections and account eligibility', () => {
 const share={id:'share',mode:'public',state:'pending',metadataRevision:0,createdAt:1,expiresAt:null,workId:'v4',versionId:'v',work:null,version:null,catalogStatus:'unavailable',publication:null,publicSource:null,author:'玩家',files:[],bytes:0,pending:null,approved:null,reports:[]};
 assert.deepEqual(moderationShareSchema.parse(share),share);
 assert.equal(moderationShareSchema.safeParse({...share,catalogStatus:'unknown'}).success,false);
 assert.equal(moderationShareSchema.safeParse({...share,files:[{name:'save'}]}).success,false);
 assert.equal(contentAdminUserSchema.safeParse({userId:'u',eligibility:null,attempts:[],audit:[]}).success,false);
});
test('private and dashboard contracts preserve HTTP paths and methods', () => {
 assert.equal(managementContract().manageEditWork['~orpc'].route.path,'/api/manage/works/{id}');
 assert.equal(managementContract('/api/dash/manage').manageEditWork['~orpc'].route.method,'PATCH');
 assert.equal(moderationContract('/api/dash/shares').contentAdminModerate['~orpc'].route.path,'/api/dash/shares/content/users/{userId}/moderate');
 assert.equal(dashboardContract.dashUsers['~orpc'].route.method,'GET');
});
