"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  BriefcaseBusiness,
  MessagesSquare,
  Compass,
  Trophy,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { ApplicationDialog } from "@/components/application-dialog";
import { Application } from "@/lib/models";
import { applicationDraft, dashboardSummary } from "@/lib/business/tracking";
import { Empty, JobCard, dateLabel } from "@/components/shared";
export default function Overview() {
  const { data, isDemo, bookmark, busy } = useWorkspace();
  const [editing, setEditing] = useState<Application | null | undefined>();
  const apps = data.applications;
  const today = new Date().toLocaleDateString("en-CA");
  const summary = dashboardSummary(apps, today);
  const tasks = apps
    .filter(
      (a) => a.important_date || ["Preparing", "Ready"].includes(a.status),
    )
    .sort((a, b) =>
      (a.important_date || a.deadline).localeCompare(
        b.important_date || b.deadline,
      ),
    );
  const metrics = [
    {
      label: "Applications tracked",
      value: summary.total,
      icon: BriefcaseBusiness,
      detail: `${summary.submitted} submitted`,
      color: "blue",
    },
    {
      label: "Active interviews",
      value: summary.interviews,
      icon: MessagesSquare,
      detail: "Your next conversations",
      color: "amber",
    },
    {
      label: "Applications submitted",
      value: summary.submitted,
      icon: Compass,
      detail: "Applied, assessments, interviews, and outcomes",
      color: "blue",
    },
    {
      label: "Offers received",
      value: summary.offers,
      icon: Trophy,
      detail: summary.offers
        ? "Good things are happening"
        : "Your next chapter is ahead",
      color: "green",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR NEXT CHAPTER</div>
          <h1>
            Keep moving forward, {data.profile.full_name.split(" ")[0]}
            <span className="greeting-dot">.</span>
          </h1>
          <p>
            A little clarity. A little progress. Your internship search, in one
            place.
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Add application
        </Button>
      </div>
      {isDemo && (
        <div className="demo-banner">
          <span>
            <span className="demo-dot" />
            You’re exploring a demo workspace. All opportunities and activity
            are sample data.
          </span>
          <Link href="/login">
            Connect your account <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="metric-grid">
        {metrics.map(({ label, value, icon: Icon, detail, color }) => (
          <div className="metric-card" key={label}>
            <div className="row between">
              <span>{label}</span>
              <span className={`metric-icon ${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <div className="metric-value">{String(value).padStart(2, "0")}</div>
            <p>
              <span className={`metric-indicator ${color}`} />
              {detail}
            </p>
          </div>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel next-actions">
          <div className="section-heading">
            <div>
              <h2>
                Next on your list{" "}
                <span className="count-badge">{tasks.length}</span>
              </h2>
              <p>Small steps that make a difference.</p>
            </div>
            <CalendarDays size={19} className="muted" />
          </div>
          {tasks.length ? (
            tasks.slice(0, 3).map((a, i) => (
              <button
                className="task-row"
                onClick={() => setEditing(a)}
                key={a.id}
              >
                <span className={`task-icon ${i === 0 ? "blue" : "neutral"}`}>
                  {a.status === "Interview" ? (
                    <MessagesSquare size={18} />
                  ) : a.status === "Ready" ? (
                    <Check size={18} />
                  ) : (
                    <BriefcaseBusiness size={18} />
                  )}
                </span>
                <span className="task-copy">
                  <strong>
                    {a.status === "Interview"
                      ? "Prepare for your interview"
                      : a.status === "Ready"
                        ? "Send your application"
                        : "Finish your application"}
                  </strong>
                  <small>
                    {a.company} <span>·</span> {a.title}
                  </small>
                </span>
                <span className="task-date">
                  {a.important_date
                    ? dateLabel(a.important_date)
                    : a.deadline
                      ? `Due ${dateLabel(a.deadline)}`
                      : "Next step"}
                </span>
                <ChevronRight size={16} className="muted" />
              </button>
            ))
          ) : (
            <Empty
              title="A clear slate"
              description="Add an application or an important date to plan your next step."
            />
          )}
          <Link className="panel-footer-link" href="/applications">
            View all applications <ArrowRight size={15} />
          </Link>
        </section>
        <section className="focus-card">
          <span className="focus-icon">
            <Compass size={24} />
          </span>
          <span className="tiny-label">YOUR SEARCH, WITH DIRECTION</span>
          <h2>
            A great fit is
            <br />
            worth finding.
          </h2>
          <p>
            Explore opportunities that could be the start of something good.
          </p>
          <Button asChild variant="outline">
            <Link href="/discover">
              Discover opportunities
              <ArrowUpRight size={16} />
            </Link>
          </Button>
          <span className="focus-decoration" aria-hidden="true">
            <Circle />
            <Circle />
            <Circle />
          </span>
        </section>
      </div>
      <section className="opportunities-section">
        <div className="section-heading">
          <div>
            <h2>Worth a closer look</h2>
            <p>
              {isDemo
                ? "A few sample opportunities to explore."
                : "Opportunities from your library. AI recommendations are not connected."}
            </p>
          </div>
          <Link className="text-link" href="/discover">
            Explore all <ArrowRight size={15} />
          </Link>
        </div>
        <div className="job-grid">
          {data.jobs.slice(0, 3).map((job) => (
            <JobCard
              key={job.id}
              job={job}
              saved={data.bookmarks.includes(job.id)}
              busy={busy}
              onDetails={() =>
                setEditing(
                  data.applications.find(
                    (app) =>
                      app.job_id === job.id &&
                      !["Rejected", "Withdrawn"].includes(app.status),
                  ) || applicationDraft("Saved", job),
                )
              }
              onSave={() => {
                void bookmark(job.id, !data.bookmarks.includes(job.id)).catch(
                  () => {},
                );
              }}
            />
          ))}
        </div>
        {!data.jobs.length && (
          <Empty
            title="Your next opportunity is out there"
            description="Add an opportunity in Discover to start building your list."
          />
        )}
      </section>
      <section className="panel deadlines-panel">
        <div className="section-heading">
          <div>
            <h2>
              Upcoming deadlines{" "}
              <span className="count-badge">{summary.upcoming.length}</span>
            </h2>
            <p>Application deadlines ahead, in date order.</p>
          </div>
          <CalendarDays size={19} className="muted" />
        </div>
        {summary.upcoming.length ? (
          summary.upcoming.slice(0, 5).map((app) => (
            <button
              className="task-row"
              key={app.id}
              onClick={() => setEditing(app)}
            >
              <span className="task-copy">
                <strong>
                  {app.company} · {app.title}
                </strong>
                <small>{app.status}</small>
              </span>
              <time className="task-date" dateTime={app.deadline}>
                {dateLabel(app.deadline)}
              </time>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty
            title="No upcoming deadlines"
            description="Add a deadline to an application and it will appear here."
          />
        )}
      </section>
      <section className="panel activity-panel">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Your progress, one update at a time.</p>
          </div>
          <span className="subtle-label">
            {isDemo ? "SAMPLE ACTIVITY" : "YOUR WORKSPACE"}
          </span>
        </div>
        {data.events.slice(0, 4).map((event, i) => (
          <div className="activity-row" key={event.id}>
            <span className={`activity-dot ${i === 0 ? "blue" : ""}`} />
            <div>
              <strong>{event.description}</strong>
              <small>{dateLabel(event.created_at)}</small>
            </div>
            <span className="activity-label">Application update</span>
          </div>
        ))}
        {!data.events.length && (
          <Empty
            title="Your story starts here"
            description="Application updates will appear as you make progress."
          />
        )}
      </section>
      <div className="quiet-note">
        <Sparkles size={15} />
        <span>
          You don’t need to have it all figured out. Just take the next step.
        </span>
      </div>
      <ApplicationDialog
        key={editing?.id || String(editing)}
        application={editing}
        onClose={() => setEditing(undefined)}
      />
    </>
  );
}
