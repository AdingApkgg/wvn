import { brand } from "../brand";
import { Link, useLocation } from "react-router";
import { BookOpen, Compass, HardDrive, Shield, Settings } from "lucide-react";
import { useContentAccess } from "../content/client";
import { accountReturnPath, sectionFor } from "../lib/reader-experience";
import { LayoutGroup, motion } from "motion/react";
import { m3Motion } from "../lib/m3-motion";

export function SiteNavigation({ preview }: { preview: boolean }) {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get("tab") ?? "library";
  const contentPage = location.pathname === "/content";
  const section = sectionFor(location.pathname, tab);
  const { enabled, access } = useContentAccess();
  const contentLabel = access.canViewRestricted ? "NSFW 已开启" : "公共浏览";
  // 链接分享的 fragment 可能含访问密钥，不得移入查询串或服务器日志。
  const contentTarget = "/content?returnTo=" + encodeURIComponent(accountReturnPath(location.pathname, location.search, location.hash));
  const links = [
    { to: "/", label: "发现", icon: Compass, active: section === "discover" },
    { to: "/account?tab=library", label: "书架", icon: BookOpen, active: section === "library" },
    { to: "/account?tab=saves", label: "存档", icon: HardDrive, active: section === "saves" },
    { to: "/account?tab=security", label: "设置", icon: Settings, active: section === "settings" },
  ];
  return <header className="site-header site-navigation">
    <Link className="brand" to="/" aria-label={`${brand.shortName} ${brand.translation}首页`}>{brand.shortName}<span>{brand.translation}</span></Link>
    <LayoutGroup id="primary-navigation"><nav aria-label="主要导航" className="primary-navigation">
      {links.map(({ to, label, icon: Icon, active }) => <Link key={to} to={to} aria-current={active ? "page" : undefined}>
        {active && <motion.span className="navigation-indicator" layoutId="active-destination" transition={m3Motion.spatial.fast} aria-hidden="true" />}
        <Icon size={22} aria-hidden="true" /><span className="navigation-label">{label}</span>
      </Link>)}
    </nav></LayoutGroup>
    <div className="navigation-account">
      {preview && <span className="preview-badge">远程预览</span>}
      {enabled && <Link to={contentPage ? location.pathname + location.search : contentTarget} className="content-mode-entry"
        data-restricted={access.canViewRestricted || undefined}
        aria-label={contentLabel} title={`${contentLabel} · ${access.eligibility === "qualified" ? "已取得资格，可管理当前会话的显示" : "查看浏览规则与测试"}`} aria-current={contentPage ? "page" : undefined}>
        <Shield size={16} aria-hidden="true" /><span className="content-mode-label">{contentLabel}</span>
        <span className="content-mode-short-label">{access.canViewRestricted ? "NSFW 开启" : "公共浏览"}</span>
        {access.eligibility === "qualified" && !access.canViewRestricted && <small>已取得资格</small>}
      </Link>}
    </div>
  </header>;
}
