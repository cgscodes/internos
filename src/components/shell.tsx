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
  BriefcaseBusiness,
  Search,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { SessionListener } from "./auth/session-listener";
import { GlassNavigation, GlassToolbar, GlassTabBar } from "./design/glass";
import { AppearanceMenu } from "./design/appearance";
import { ProfileMenu, NotificationsMenu } from "./design/workspace-menus";
export const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/applications", label: "Applications", icon: Columns3 },
  { href: "/resumes", label: "Resumes", icon: Files },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data } = useWorkspace();
  return (
    <div className="app-shell">
      <SessionListener />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <GlassNavigation>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BriefcaseBusiness size={21} />
          </span>
          <span>
            Intern<span className="brand-os">OS</span>
          </span>
          <span className="brand-dot" />
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-monogram">P</span>
          <span>
            <strong>Personal workspace</strong>
            <small>Your next chapter</small>
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${path === href ? "active" : ""}`}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {label === "Applications" && (
                <span className="nav-count">{data.applications.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <section className="sidebar-note">
            <span className="tiny-label">ONE STEP CLOSER</span>
            <h3>
              Make your next
              <br />
              move a good one.
            </h3>
            <p>A clear space for what comes next.</p>
            <Link href="/discover">
              Explore opportunities
              <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="workspace-security">
            <ShieldCheck size={14} />
            <span>Private by default</span>
            <i />
          </div>
          <ProfileMenu expanded />
        </div>
      </GlassNavigation>
      <div className="main-area">
        <GlassToolbar>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find((link) => link.href === path)?.label ||
                "Overview"}
            </strong>
          </div>
          <Link href="/" className="mobile-brand">
            <span className="brand-icon">
              <BriefcaseBusiness size={18} />
            </span>
            InternOS
          </Link>
          <div className="utility-right">
            <Link href="/discover" className="utility-search">
              <Search size={16} />
              <span>Find your next role</span>
              <kbd>↗</kbd>
            </Link>
            <AppearanceMenu />
            <NotificationsMenu />
            <span className="toolbar-divider" />
            <ProfileMenu />
          </div>
        </GlassToolbar>
        <main id="main" className="content">
          {children}
          <footer className="page-footer">
            <span>
              <span className="footer-mark" />A little progress, every day.
            </span>
            <span>InternOS · Your next chapter</span>
          </footer>
        </main>
      </div>
      <GlassTabBar aria-label="Mobile navigation">
        {navigation.map(({ href, label, icon: Icon }) => (
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
      </GlassTabBar>
    </div>
  );
}
