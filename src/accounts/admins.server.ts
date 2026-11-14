import type {PgDatabase} from '../database/postgres.ts';
import {AccountError} from './errors.server.ts';

export class AdminStore {
  constructor(private db:PgDatabase,private bootstrap:()=>Set<string>){}
  protected(userId:string){return this.bootstrap().has(userId)}
  async isAdmin(userId:string){
    if(this.protected(userId))return true;
    return (await this.db.prepare('SELECT active FROM wg_admin_roles WHERE user_id=$1').get(userId))?.active===true;
  }
  async describe(userId:string){
    const row=await this.db.prepare('SELECT active,revision FROM wg_admin_roles WHERE user_id=$1').get(userId);
    const adminProtected=this.protected(userId);
    return {admin:adminProtected||row?.active===true,adminProtected,adminRevision:Number(row?.revision??0)};
  }
  async change(actor:string,target:string,action:'grant'|'revoke',revision:number,reason:string){
    if(!['grant','revoke'].includes(action)||!Number.isSafeInteger(revision)||revision<0||typeof reason!=='string'||!reason.trim()||[...reason.trim()].length>1000||/[\p{Cc}\p{Cf}]/u.test(reason))
      throw new AccountError(400,'ADMIN_CHANGE_INVALID');
    return this.db.transaction(async()=>{
      // 与角色变更共享事务锁；必须在等待锁后重新验证操作者，避免已撤权请求继续授权。
      if(!await this.isAdmin(actor))throw new AccountError(403,'ADMIN_REQUIRED');
      if(this.protected(target))throw new AccountError(403,'ADMIN_PROTECTED');
      if(actor===target)throw new AccountError(403,'ADMIN_SELF_CHANGE');
      const user=await this.db.prepare('SELECT p.uid::text AS uid FROM "user" u JOIN wg_public_profiles p ON p.user_id=u.id WHERE u.id=$1 FOR KEY SHARE OF u').get(target);
      if(!user)throw new AccountError(404,'NOT_FOUND');
      const previous=await this.describe(target);
      if(previous.adminRevision!==revision)throw new AccountError(409,'ADMIN_CONFLICT');
      await this.db.prepare(`INSERT INTO wg_admin_roles(user_id,active,revision,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()`)
        .run(target,action==='grant',revision+1,actor);
      await this.db.prepare('INSERT INTO wg_dashboard_audit(actor,action,target,reason,status) VALUES($1,$2,$3,$4,200)')
        .run(actor,'admin.'+action,'/api/dash/users/'+user.uid+'/admin',reason.trim());
      return this.describe(target);
    },{lock:'wvn:admin-roles'});
  }
}
