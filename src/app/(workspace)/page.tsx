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
  ChevronRight,
  Files,
  Check,
  Clock3,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { ApplicationDialog } from "@/components/application-dialog";
import { PageHeader, StatCard } from "@/components/design/page";
import { Application, statuses } from "@/lib/models";
import { applicationDraft, dashboardSummary } from "@/lib/business/tracking";
import { Empty, JobCard, Status, dateLabel } from "@/components/shared";
export default function Overview() {
  const { data, bookmark, busy } = useWorkspace();
  const [editing, setEditing] = useState<Application | null | undefined>();
  const apps = data.applications;
  const today = new Date().toLocaleDateString("en-CA");
  const summary = dashboardSummary(apps, today);
  const tasks = apps
    .filter(
      (app) =>
        app.important_date || ["Preparing", "Ready"].includes(app.status),
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
      detail: "Every opportunity, in one place",
      tone: "blue",
    },
    {
      label: "Applications submitted",
      value: summary.submitted,
      icon: Compass,
      detail: "Applications sent & outcomes",
      tone: "blue",
    },
    {
      label: "Active interviews",
      value: summary.interviews,
      icon: MessagesSquare,
      detail: summary.interviews
        ? "Keep the conversation going"
        : "Your next conversation awaits",
      tone: "amber",
    },
    {
      label: "Offers received",
      value: summary.offers,
      icon: Trophy,
      detail: summary.offers
        ? "A new chapter is opening"
        : "Good things take a little time",
      tone: "green",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title={
          <>
            Keep moving forward, {data.profile.full_name.split(" ")[0]}
            <span className="greeting-dot">.</span>
          </>
        }
        description="A clear view of where you are. A little direction for what’s next."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus size={18} />
            Add application
          </Button>
        }
      />
      <div className="metric-grid">
        {metrics.map((metric) => (
          <StatCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel pipeline-summary">
          <div className="section-heading">
            <div>
              <h2>Your application pipeline</h2>
              <p>Every stage of your next chapter.</p>
            </div>
            <Link className="text-link" href="/applications">
              View board
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {apps.length ? (
            <>
              <div
                className="pipeline-bar"
                role="img"
                aria-label={statuses
                  .map(
                    (status) =>
                      `${status}: ${apps.filter((app) => app.status === status).length}`,
                  )
                  .join(", ")}
              >
                {statuses.map((status) => {
                  const count = apps.filter(
                    (app) => app.status === status,
                  ).length;
                  return count > 0 ? (
                    <span
                      key={status}
                      className={`pipeline-segment stage-${status.toLowerCase()}`}
                      style={{ flex: count }}
                    />
                  ) : null;
                })}
              </div>
              <div className="pipeline-stages">
                {statuses.map((status) => (
                  <div key={status}>
                    <Status value={status} />
                    <span>
                      {apps.filter((app) => app.status === status).length}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title="Your pipeline starts here"
              description="Add your first application. Every step will have a place to land."
            />
          )}
          <div className="panel-footer">
            <span>
              <span className="success-dot" />
              {summary.submitted} submitted applications
            </span>
            <Link className="text-link" href="/applications">
              Manage pipeline
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
        <section className="panel deadlines-panel">
          <div className="section-heading">
            <div>
              <h2>
                Upcoming deadlines
                <span className="count-badge">{summary.upcoming.length}</span>
              </h2>
              <p>A little preparation goes a long way.</p>
            </div>
            <CalendarDays size={20} className="muted" />
          </div>
          {summary.upcoming.length ? (
            summary.upcoming.slice(0, 4).map((app) => (
              <button
                className="task-row deadline-row"
                key={app.id}
                onClick={() => setEditing(app)}
              >
                <span className="date-tile">
                  <strong>
                    {new Date(app.deadline + "T12:00:00").getDate()}
                  </strong>
                  <small>
                    {new Date(app.deadline + "T12:00:00").toLocaleDateString(
                      "en-US",
                      { month: "short" },
                    )}
                  </small>
                </span>
                <span className="task-copy">
                  <strong>{app.company}</strong>
                  <small>{app.title}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="No upcoming deadlines"
              description="Add application deadlines to stay one step ahead."
            />
          )}
        </section>
        <section className="panel next-actions">
          <div className="section-heading">
            <div>
              <h2>
                Next on your list
                <span className="count-badge">{tasks.length}</span>
              </h2>
              <p>Small steps. Meaningful progress.</p>
            </div>
            <Clock3 size={20} className="muted" />
          </div>
          {tasks.length ? (
            tasks.slice(0, 3).map((app) => (
              <button
                className="task-row"
                key={app.id}
                onClick={() => setEditing(app)}
              >
                <span className="task-icon">
                  {app.status === "Interview" ? (
                    <MessagesSquare size={18} />
                  ) : app.status === "Ready" ? (
                    <Check size={18} />
                  ) : (
                    <BriefcaseBusiness size={18} />
                  )}
                </span>
                <span className="task-copy">
                  <strong>
                    {app.status === "Interview"
                      ? "Prepare for your interview"
                      : app.status === "Ready"
                        ? "Send your application"
                        : "Finish your application"}
                  </strong>
                  <small>
                    {app.company} · {app.title}
                  </small>
                </span>
                <span className="task-date">
                  {app.important_date
                    ? dateLabel(app.important_date)
                    : app.deadline
                      ? dateLabel(app.deadline)
                      : "Next step"}
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="A clear slate"
              description="Your next actions appear here as you prepare applications and interviews."
            />
          )}
        </section>
        <section className="panel quick-actions">
          <div className="section-heading">
            <div>
              <h2>A good next move</h2>
              <p>A shortcut to what matters.</p>
            </div>
            <ArrowUpRight size={20} className="muted" />
          </div>
          {[
            {
              href: "/discover",
              icon: Compass,
              title: "Find your next opportunity",
              detail: "Explore your job library",
            },
            {
              href: "/resumes",
              icon: Files,
              title: "Put your best self forward",
              detail: "Organize resumes and versions",
            },
            {
              href: "/settings",
              icon: BriefcaseBusiness,
              title: "Make room for your goals",
              detail: "Update your career preferences",
            },
          ].map(({ href, icon: Icon, title, detail }) => (
            <Link className="quick-action" key={href} href={href}>
              <span className="task-icon">
                <Icon size={18} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </section>
      </div>
      <section className="opportunities-section">
        <div className="section-heading">
          <div>
            <h2>Worth a closer look</h2>
            <p>A few opportunities from your library to explore.</p>
          </div>
          <Link className="text-link" href="/discover">
            Explore all
            <ArrowRight size={16} />
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
          <div className="panel">
            <Empty
              title="Your next opportunity is out there"
              description="Add a role you’ve found in Discover to begin your search."
            />
          </div>
        )}
      </section>
      <section className="panel activity-panel">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p>The small wins, and the steps between them.</p>
          </div>
          <span className="subtle-label">YOUR WORKSPACE</span>
        </div>
        {data.events.slice(0, 5).map((event) => (
          <div className="activity-row" key={event.id}>
            <span className="activity-dot" />
            <div>
              <strong>{event.description}</strong>
              <small>Application update</small>
            </div>
            <time dateTime={event.created_at}>
              {dateLabel(event.created_at)}
            </time>
          </div>
        ))}
        {!data.events.length && (
          <Empty
            title="Your story starts here"
            description="Application updates will appear as you make progress."
          />
        )}
      </section>
      <ApplicationDialog
        key={editing?.id || String(editing)}
        application={editing}
        onClose={() => setEditing(undefined)}
      />
    </>
  );
}
