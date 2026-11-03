import { brand } from "../brand";
import { Link, useLocation } from "react-router";
import { BookOpen, Compass, HardDrive, Shield, UserRound } from "lucide-react";
import { useContentAccess } from "../content/client";

export function SiteNavigation({ preview }: { preview: boolean }) {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get("tab") ?? "library";
  const account = location.pathname === "/account";
  const contentPage = location.pathname === "/content";
  const { enabled, access } = useContentAccess();
  const contentLabel = access.canViewRestricted ? "NSFW 已开启" : "公共浏览";
  // 链接分享的 fragment 可能含访问密钥，不得移入查询串或服务器日志。
  const returnHash = /^\/s\//.test(location.pathname) ? "" : location.hash;
  const contentTarget = "/content?returnTo=" + encodeURIComponent(location.pathname + location.search + returnHash);
  const links = [
    { to: "/", label: "发现", icon: Compass, active: !account && !contentPage },
    { to: "/account?tab=library", label: "我的书架", icon: BookOpen, active: account && tab === "library" },
    { to: "/account?tab=saves", label: "存档", icon: HardDrive, active: account && tab === "saves" },
  ];
  return <header className="site-header site-navigation">
    <Link className="brand" to="/" aria-label={`${brand.shortName} ${brand.translation}首页`}>{brand.shortName}<span>{brand.translation}</span></Link>
    <nav aria-label="主要导航" className="primary-navigation">
      {links.map(({ to, label, icon: Icon, active }) => <Link key={to} to={to} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
    <div className="navigation-account">
      {preview && <span className="preview-badge">远程预览</span>}
      {enabled && <Link to={contentPage ? location.pathname + location.search : contentTarget} className="content-mode-entry"
        aria-label={contentLabel} title={access.eligibility === "qualified" ? "已取得资格，可管理当前会话的显示" : "查看浏览规则与测试"} aria-current={contentPage ? "page" : undefined}>
        <Shield size={16} aria-hidden="true" /><span>{contentLabel}</span>
        {access.eligibility === "qualified" && !access.canViewRestricted && <small>已取得资格</small>}
      </Link>}
      <Link to="/account?tab=security" className="account-entry" aria-label="账号与安全" aria-current={account && tab === "security" ? "page" : undefined}><UserRound size={18} aria-hidden="true" /></Link>
    </div>
  </header>;
}
