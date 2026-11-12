"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Settings,
  LogOut,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown,
  Clock3,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { UserAvatar } from "@/components/auth/user-avatar";
import { GlassPopover } from "./glass-popover";
import { AppearanceControls } from "./appearance";
import { dateLabel } from "@/components/shared";
export function ProfileMenu({ expanded = false }: { expanded?: boolean }) {
  const { data } = useWorkspace();
  return (
    <GlassPopover
      label="Your workspace"
      trigger={
        <Button
          variant="ghost"
          type="button"
          className={expanded ? "profile-link" : "icon-button profile-trigger"}
          aria-label={expanded ? "Open workspace profile" : "Your profile"}
        >
          <span className="avatar">
            <UserAvatar />
          </span>
          {expanded && (
            <>
              <span className="profile-copy">
                <strong>{data.profile.full_name}</strong>
                <small>{data.email || "Personal workspace"}</small>
              </span>
              <ChevronDown size={16} />
            </>
          )}
        </Button>
      }
    >
      <div className="popover-identity">
        <strong>{data.profile.full_name}</strong>
        <span>{data.email}</span>
        <small>
          <ShieldCheck size={12} />
          Private personal workspace
        </small>
      </div>
      <Link className="menu-item" href="/settings">
        <Settings size={17} />
        Profile & settings
        <ArrowUpRight size={15} />
      </Link>
      <div className="menu-separator" />
      <span className="menu-label">APPEARANCE</span>
      <AppearanceControls />
      <div className="menu-separator" />
      <form action="/auth/logout" method="POST">
        <button className="menu-item" type="submit">
          <LogOut size={17} />
          Sign out
        </button>
      </form>
    </GlassPopover>
  );
}
export function NotificationsMenu() {
  const { data } = useWorkspace();
  return (
    <GlassPopover
      label="Workspace updates"
      trigger={
        <Button
          variant="ghost"
          className="icon-button toolbar-control notification-trigger"
          aria-label="Workspace notifications"
        >
          <Bell size={18} />
          {data.events.length > 0 && <span className="notification-dot" />}
        </Button>
      }
    >
      <div className="notification-list">
        {data.events.length ? (
          data.events.slice(0, 5).map((event) => (
            <article key={event.id}>
              <span className="notification-symbol">
                <Clock3 size={16} />
              </span>
              <div>
                <p>{event.description}</p>
                <time dateTime={event.created_at}>
                  {dateLabel(event.created_at)}
                </time>
              </div>
            </article>
          ))
        ) : (
          <div className="popover-empty">
            <Bell size={24} />
            <strong>You’re all caught up</strong>
            <p>Application updates will appear here as you make progress.</p>
          </div>
        )}
      </div>
      <Link className="menu-item" href="/">
        Open overview
        <ArrowUpRight size={16} />
      </Link>
    </GlassPopover>
  );
}
