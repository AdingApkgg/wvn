import { z } from "zod";
import { endpoint } from "../endpoint.ts";
import { metadataSchema } from "../../metadata.ts";

const s=z.string(), n=z.number(), revision=n.int().nonnegative(), id=s.min(1).max(500);
const empty=z.object({});
const evidence={reason:s,source:s,reviewedAt:s,revision};
export const workClassification=z.object({...evidence,pageSuitability:z.enum(['sfw','nsfw','unknown'])});
export const versionClassification=z.object({...evidence,sexualContent:z.enum(['none','present','unknown']),titleSafe:z.boolean(),ageRating:s.optional()});
export const imageClassification=z.object({...evidence,sexual:z.enum(['safe','suggestive','explicit','unknown']),violence:z.enum(['tame','violent','brutal','unknown']),spoiler:z.boolean(),rawSexual:n.optional(),rawViolence:n.optional(),voteCount:revision.optional()});
const classification=z.union([workClassification,versionClassification,imageClassification]);
const check=z.object({versionId:s,kind:z.enum(['resources','http','startup']),runId:s,startedAt:s,checkedAt:s,status:z.enum(['passed','failed','incomplete']),detail:s});
export const adminVersionSchema=z.object({id:s,workId:s,number:n,title:s,engine:s,revision,status:z.enum(['published','hidden','deleted']),createdAt:s,legacyPath:s,language:s,notes:s,sortOrder:n,classification:versionClassification.optional()});
export const adminPublicVersionSchema=adminVersionSchema.omit({legacyPath:true,createdAt:true,status:true}).extend({status:z.enum(['published','hidden','deleted']).optional(),url:s,launchPath:s,checks:z.array(check)});
export const adminWorkSchema=z.object({id:s,title:s,originalTitle:s,aliases:z.array(s),evidence:s,revision,defaultVersionId:s.nullable(),url:s,versions:z.array(adminPublicVersionSchema),classification:workClassification.optional(),metadata:metadataSchema.optional(),coverStatus:z.enum(['available','missing','unavailable','unreviewed','restricted']).optional()});
const label=s.trim().min(1).max(300);
export const createWorkInput=z.object({id:s.regex(/^[vb][1-9]\d{0,8}$/),title:label,originalTitle:label,aliases:z.array(label).max(50),evidence:s.url()}).strict();
export const versionInput=z.object({title:label,legacyPath:s.min(1),engine:z.enum(['ONS','Artemis','RenPy','Tyrano']),language:s.max(80).optional(),notes:s.max(4000).optional(),sortOrder:revision.optional()}).strict();
export const workPatch=z.object({title:label.optional(),aliases:z.array(label).max(50).optional(),defaultVersionId:s.nullable().optional()}).strict();
export const versionPatch=z.object({title:label.optional(),status:z.enum(['published','hidden','deleted']).optional(),language:s.max(80).optional(),notes:s.max(4000).optional(),sortOrder:revision.optional()}).strict();
const reviewText=z.object({title:s,originalTitle:s,aliases:z.array(s),evidence:s,versions:z.array(z.object({id:s,title:s,notes:s,language:s})),metadata:z.object({titles:metadataSchema.shape.titles,description:metadataSchema.shape.description,tags:metadataSchema.shape.tags,developers:metadataSchema.shape.developers,languages:metadataSchema.shape.languages,platforms:metadataSchema.shape.platforms,released:metadataSchema.shape.released,warnings:metadataSchema.shape.warnings,sources:metadataSchema.shape.sources}).nullable()});
const reviewFields={id:s,manual:z.boolean(),fingerprint:s.optional(),reviewFingerprint:s.optional(),reviewText:reviewText.optional()};
export const classificationRecordSchema=z.discriminatedUnion('kind',[
 z.object({...reviewFields,kind:z.literal('work'),classification:workClassification}),z.object({...reviewFields,kind:z.literal('version'),classification:versionClassification}),z.object({...reviewFields,kind:z.literal('image'),classification:imageClassification})]);
const updateBase={id,expectedRevision:revision,expectedFingerprint:s.regex(/^[0-9a-f]{64}$/).optional()};
export const classificationUpdateSchema=z.discriminatedUnion('kind',[
 z.object({...updateBase,kind:z.literal('work'),expectedFingerprint:s.regex(/^[0-9a-f]{64}$/),payload:workClassification.omit({revision:true})}).strict(),
 z.object({...updateBase,kind:z.literal('version'),payload:versionClassification.omit({revision:true})}).strict(),
 z.object({...updateBase,kind:z.literal('image'),payload:imageClassification.omit({revision:true})}).strict()]);
const ok=z.object({ok:z.literal(true)});
const login=z.object({body:z.object({token:s.max(128)}).strict()});
const reason=s.min(1).max(1000), action=z.enum(['suspend','unsuspend','revoke','require_retest']);
const eligibility=z.object({status:z.enum(['unqualified','qualified','suspended','needs_retest']),policyVersion:s.nullable(),quizVersion:s.nullable(),qualifiedAt:n.nullable(),grantedBy:s.nullable(),updatedAt:n.nullable()});
export const contentAdminUserSchema=z.object({userId:s,eligibility,attempts:z.array(z.object({id:s,policyVersion:s,quizVersion:s,createdAt:n,expiresAt:n,submittedAt:n.nullable(),invalidatedAt:n.nullable(),passed:z.boolean().nullable(),incorrectQuestionIds:z.array(s)})),audit:z.array(z.object({action:s,reason:s,actor:s,createdAt:n,shareId:s.optional(),suitability:z.enum(['sfw','nsfw','unknown']).optional(),metadataRevision:n.optional()}))});
const shareText=z.object({title:s,description:s,progress:z.enum(['chapter','route','complete','unlock','other']),spoiler:z.boolean()});
const shareWork=z.object({id:s,title:s,url:s});
const shareVersion=z.object({id:s,title:s,number:n,engine:s,url:s,engineReleaseId:s.optional()});
export const moderationShareSchema=z.object({id:s,mode:z.enum(['public','link']),state:s,metadataRevision:revision,createdAt:n,expiresAt:n.nullable(),workId:s,versionId:s,work:shareWork.nullable(),version:shareVersion.nullable(),catalogStatus:z.enum(['visible','hidden','unavailable']),publication:z.object({work:shareWork,version:shareVersion}).nullable(),publicSource:z.object({id:s,title:s}).nullable(),author:s,files:z.array(z.object({name:s,bytes:n,sha256:s})),bytes:n,pending:shareText.nullable(),approved:shareText.nullable(),reports:z.array(z.object({id:s,reason:s,created:n}))});
const adminRole=z.object({admin:z.boolean(),adminProtected:z.boolean(),adminRevision:revision});
export const dashboardUserSchema=adminRole.extend({id:s,uid:s,name:s,published:z.boolean(),joinedAt:s,eligibility:s});
export const dashboardContract={
 dashOverview:endpoint('GET','/api/dash/overview',empty,z.object({users:n,pendingShares:n,works:n.nullable(),versions:n.nullable(),catalogAvailable:z.boolean(),contentEnabled:z.boolean()})),
 dashUsers:endpoint('GET','/api/dash/users',z.object({query:z.object({q:s.max(100).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}).optional()}),z.object({items:z.array(dashboardUserSchema),next:n.nullable()})),
 dashAudit:endpoint('GET','/api/dash/audit',empty,z.array(z.object({id:z.union([s,n]),actor:s,action:s,target:s,reason:s,status:n.nullable(),created_at:s}))),
 dashUser:endpoint('GET','/api/dash/users/{uid}',z.object({params:z.object({uid:id})}),adminRole.extend({id:s,uid:s,name:s,bio:s,published:z.boolean(),revision,joinedAt:s})),
 dashAdminChange:endpoint('POST','/api/dash/users/{uid}/admin',z.object({params:z.object({uid:id}),body:z.object({action:z.enum(['grant','revoke']),revision,reason}).strict()}),adminRole),
};
const file=z.object({path:s,sha256:s});
const engineSummary=z.object({schema:n,versions:n,emscriptenVersions:n,toolchains:z.array(z.object({id:s,version:s,emsdkCommit:s})),releases:z.array(z.object({id:s,kind:z.enum(['ONS','Artemis','RenPy','Tyrano']),mode:z.enum(['factory','global','javascript']),files:z.array(file),sourceCapability:z.literal('imported-prebuilt'),versions:n})),bindings:z.array(z.object({playerId:s,versionId:s,releaseId:s,legacyEngine:s,saveCompatibilityId:s})),status:z.object({schema:n,at:s,jobs:z.array(z.object({id:s,recipe:s,state:s,at:s.optional(),sdk:z.object({id:s,version:s,status:s}).nullable(),releaseId:s.nullable(),compatibility:s.nullable(),errorCode:s.nullable()}))})});
export function managementContract(prefix='/api/manage') {return {
 manageLogin:endpoint('POST',prefix+'/login',login,ok),
 manageEngines:endpoint('GET',prefix+'/engines',empty,engineSummary),
 manageCatalog:endpoint('GET',prefix+'/catalog',empty,z.array(adminWorkSchema)),
 managePending:endpoint('GET',prefix+'/pending',empty,z.array(z.object({id:s,title:s,legacyPath:s,meta:s,reason:s}))),
 manageCreateWork:endpoint('POST',prefix+'/works',z.object({body:createWorkInput}),adminWorkSchema),
 manageAssignPending:endpoint('POST',prefix+'/pending/{id}/assign',z.object({params:z.object({id}),body:z.object({workId:s})}),adminVersionSchema),
 manageSources:endpoint('GET',prefix+'/sources',empty,z.object({entries:z.array(z.object({id:s.optional(),title:s.optional(),source:s.optional(),workId:s.optional(),status:s.optional(),reason:s.optional(),url:s.optional(),name:s.optional(),nativeEngineHint:s.optional(),disposition:s.optional(),existingUrl:s.optional()})),limitations:z.array(s).optional()})),
 manageEditWork:endpoint('PATCH',prefix+'/works/{id}',z.object({params:z.object({id}),body:z.object({revision,patch:workPatch}).strict()}),adminWorkSchema),
 manageAddVersion:endpoint('POST',prefix+'/works/{id}/versions',z.object({params:z.object({id}),body:versionInput}),adminVersionSchema),
 manageEditVersion:endpoint('PATCH',prefix+'/versions/{id}',z.object({params:z.object({id}),body:z.object({revision,patch:versionPatch}).strict()}),adminVersionSchema),
 manageReassignVersion:endpoint('POST',prefix+'/versions/{id}/reassign',z.object({params:z.object({id}),body:z.object({revision,workId:s}).strict()}),adminVersionSchema),
 manageImportReport:endpoint('POST',prefix+'/reports',z.object({body:check.strict()}),check),
 manageClassifications:endpoint('GET',prefix+'/content-classification',empty,z.array(classificationRecordSchema)),
 manageSetClassification:endpoint('PATCH',prefix+'/content-classification',z.object({body:classificationUpdateSchema}),classification),
};}
export function moderationContract(prefix='/api/share-admin') {return {
 shareAdminLogin:endpoint('POST',prefix+'/login',login,ok),
 shareAdminQueue:endpoint('GET',prefix+'/queue',empty,z.array(moderationShareSchema)),
 shareAdminAudit:endpoint('GET',prefix+'/audit',empty,z.array(z.object({share:s,action:s,reason:s,created:n}))),
 shareAdminModerate:endpoint('POST',prefix+'/{id}/moderate',z.object({params:z.object({id}),body:z.object({revision,action:z.enum(['approve','block','reject','resolve']),reason}).strict()}),ok),
 contentAdminUser:endpoint('GET',prefix+'/content/users/{userId}',z.object({params:z.object({userId:id})}),contentAdminUserSchema),
 contentAdminModerate:endpoint('POST',prefix+'/content/users/{userId}/moderate',z.object({params:z.object({userId:id}),body:z.object({action,reason}).strict()}),contentAdminUserSchema),
 contentAdminClassifyShare:endpoint('PATCH',prefix+'/content/shares/{id}',z.object({params:z.object({id}),body:z.object({suitability:z.enum(['sfw','nsfw','unknown']),revision:n.int().positive(),reason}).strict()}),z.object({id:s,suitability:z.enum(['sfw','nsfw','unknown']),revision})),
};}
// 站内后台使用账号会话，不暴露私有监听器的一次性令牌登录。
const {manageLogin: _manageLogin, ...dashboardManagement} = managementContract('/api/dash/manage');
const {shareAdminLogin: _shareAdminLogin, ...dashboardModeration} = moderationContract('/api/dash/shares');
export const adminContract={...dashboardContract,...dashboardManagement,...dashboardModeration};
