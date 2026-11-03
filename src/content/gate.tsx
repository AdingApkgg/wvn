import { Link } from "react-router";
import { Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { useContentAccess } from "./client";
import { safeReturnPath } from "./policy";
import type { ReactNode } from "react";

const descriptions: Record<string, string> = {
  SIGN_IN_REQUIRED: "请先登录账号，完成本站规则测试，再主动开启当前会话的显示。",
  CONTENT_QUALIFICATION_REQUIRED: "这部分内容需要先完成本站规则理解测试，并主动开启显示。",
  CONTENT_UNQUALIFIED: "这部分内容需要先完成本站规则理解测试，并主动开启显示。",
  CONTENT_RETEST_REQUIRED: "本站规则已更新，请重新完成规则测试后再开启显示。",
  CONTENT_SUSPENDED: "当前浏览资格已暂停，暂时无法开启显示。你仍可使用公共目录和私人备份操作。",
  CONTENT_MODE_REQUIRED: "你已取得浏览资格。当前会话使用公共浏览，可在浏览设置中主动开启。",
  CONTENT_UNREVIEWED: "这部分内容仍待核实，暂时无法打开。请稍后再试，或继续浏览公开目录。",
  CONTENT_UNAVAILABLE: "暂时无法确认浏览权限，请稍后重试。",
};

export function ContentGate({ code, returnTo, action }: { code: string; returnTo: string; action?: ReactNode }) {
  const { access } = useContentAccess();
  const suspended = code === "CONTENT_SUSPENDED" || access.eligibility === "suspended";
  const unavailable = code === "CONTENT_UNREVIEWED" || code === "CONTENT_UNAVAILABLE";
  const label = !access.authenticated ? "登录并查看规则" :
    access.eligibility === "qualified" ? "前往浏览设置" : "查看规则与测试";
  return <section className="content-gate" aria-labelledby="content-gate-heading">
    <Shield size={26} aria-hidden="true" />
    <h1 id="content-gate-heading">此内容暂不可见</h1>
    <p>{descriptions[code] ?? "这部分内容目前受限，请查看浏览设置中的下一步说明。"}</p>
    <div className="content-actions">
      {!suspended && !unavailable && (action ?? <Button asChild><Link to={"/content?returnTo=" + encodeURIComponent(safeReturnPath(returnTo))}>{label}</Link></Button>)}
      <Button asChild variant="outline"><Link to="/">返回公共目录</Link></Button>
      {suspended && <Link to="/account?tab=saves">管理私人备份</Link>}
    </div>
  </section>;
}
