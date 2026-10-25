import { brand } from "../brand";
import { Link, useLocation } from "react-router";
import { BookOpen, Compass, HardDrive, UserRound } from "lucide-react";

export function SiteNavigation({ preview }: { preview: boolean }) {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get("tab") ?? "library";
  const account = location.pathname === "/account";
  const links = [
    { to: "/", label: "发现", icon: Compass, active: !account },
    { to: "/account?tab=library", label: "我的书架", icon: BookOpen, active: account && tab === "library" },
    { to: "/account?tab=saves", label: "存档", icon: HardDrive, active: account && tab === "saves" },
  ];
  return <header className="site-header site-navigation">
    <Link className="brand" to="/" aria-label={`${brand.shortName} ${brand.translation}首页`}>{brand.shortName}<span>{brand.translation}</span></Link>
    <nav aria-label="主要导航" className="primary-navigation">
      {links.map(({ to, label, icon: Icon, active }) => <Link key={to} to={to} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
    <div className="navigation-account">{preview && <span className="preview-badge">远程预览</span>}<Link to="/account?tab=security" className="account-entry" aria-label="账号与安全" aria-current={account && tab === "security" ? "page" : undefined}><UserRound size={18} aria-hidden="true" /></Link></div>
  </header>;
}
