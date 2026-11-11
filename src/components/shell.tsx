"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Columns3,
  Files,
  Settings,
  ArrowUpRight,
  ChevronDown,
  BriefcaseBusiness,
  Search,
  CircleHelp,
  PanelLeftClose,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/applications", label: "Applications", icon: Columns3 },
  { href: "/resumes", label: "Resumes", icon: Files },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, isDemo } = useWorkspace();
  const initials = data.profile.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BriefcaseBusiness size={22} />
          </span>
          Intern<span className="brand-os">OS</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${path === href ? "active" : ""}`}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {label === "Applications" && (
                <span className="nav-count">{data.applications.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-label">A LITTLE PROGRESS, EVERY DAY</span>
            <h3>
              Your next chapter
              <br />
              starts here.
            </h3>
            <p>Find your direction. Make your move.</p>
            <Link href="/discover">
              Explore opportunities <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link className="help-link" href="/settings">
            <CircleHelp size={17} />
            Workspace & account
            <PanelLeftClose size={16} />
          </Link>
          <Link href="/settings" className="profile-link">
            <span className="avatar">{initials}</span>
            <span>
              <strong>{data.profile.full_name}</strong>
              <small>
                {isDemo ? "Personal workspace · Demo" : "Personal workspace"}
              </small>
            </span>
            <ChevronDown size={16} />
          </Link>
        </div>
      </aside>
      <div className="main-area">
        <header className="utility-bar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>
              {links.find((l) => l.href === path)?.label || "Overview"}
            </strong>
          </div>
          <Link href="/" className="mobile-brand">
            InternOS
          </Link>
          <div className="utility-right">
            <Link href="/discover" className="utility-search">
              <Search size={16} />
              <span>Find an opportunity</span>
              <kbd>↗</kbd>
            </Link>
            <span className={`connection ${isDemo ? "" : "live"}`}>
              <i />
              {isDemo ? "Demo workspace" : "Connected"}
            </span>
            <Link
              href="/settings"
              className="avatar small"
              aria-label="Your profile"
            >
              {initials}
            </Link>
          </div>
        </header>
        <main id="main" className="content">
          {children}
          <footer className="page-footer">
            <span>Built for your next chapter.</span>
            <span>One step closer.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={path === href ? "active" : ""}
            aria-current={path === href ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
