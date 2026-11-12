"use client";
import { Plus, LayoutGrid, List, ArrowUpRight } from "lucide-react";
import type { Application } from "@/lib/models";
import { statuses } from "@/lib/models";
import { applicationDraft } from "@/lib/business/tracking";
import { CompanyMark, Status, dateLabel } from "@/components/shared";
import { useWorkspace } from "@/components/workspace-provider";
import { GlassButton } from "./glass";
export function ViewSelector({
  view,
  onChange,
}: {
  view: "board" | "list";
  onChange: (view: "board" | "list") => void;
}) {
  return (
    <div
      className="segmented-control view-selector"
      aria-label="Application view"
    >
      <GlassButton
        variant="ghost"
        aria-pressed={view === "board"}
        onClick={() => onChange("board")}
      >
        <LayoutGrid size={16} />
        <span>Board</span>
      </GlassButton>
      <GlassButton
        variant="ghost"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <List size={16} />
        <span>List</span>
      </GlassButton>
    </div>
  );
}
export function ApplicationCard({
  application,
  onOpen,
}: {
  application: Application;
  onOpen: () => void;
}) {
  const { busy, setStatus } = useWorkspace();
  return (
    <article className="application-card">
      <button
        className="application-card-open"
        onClick={onOpen}
        aria-label={`${application.company} ${application.title}`}
      >
        <div className="row">
          <CompanyMark name={application.company} />
          <strong>{application.company}</strong>
          <ArrowUpRight size={15} className="card-open-icon" />
        </div>
        <h3>{application.title}</h3>
        <p>{application.location || "Location not specified"}</p>
        <div className="application-card-footer">
          <span>
            {application.deadline
              ? `Due ${dateLabel(application.deadline)}`
              : "No deadline"}
          </span>
          {application.attempt > 1 && (
            <span>Attempt {application.attempt}</span>
          )}
        </div>
      </button>
      <label className="pipeline-status">
        <span>Status</span>
        <select
          aria-label={`Status for ${application.title} at ${application.company}`}
          value={application.status}
          disabled={busy}
          onChange={(event) => {
            void setStatus(
              application.id,
              event.target.value as Application["status"],
            ).catch(() => {});
          }}
        >
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>
    </article>
  );
}
export function PipelineBoard({
  applications,
  status,
  view,
  onEdit,
}: {
  applications: Application[];
  status: string;
  view: "board" | "list";
  onEdit: (app: Application) => void;
}) {
  return (
    <div
      className={`kanban ${view === "list" ? "pipeline-list" : ""}`}
      role="region"
      aria-label="Applications grouped by status"
      tabIndex={0}
    >
      {statuses
        .filter((stage) => status === "All statuses" || status === stage)
        .map((stage) => (
          <section className="kanban-column" key={stage}>
            <div className="kanban-heading">
              <Status value={stage} />
              <span className="column-count">
                {applications.filter((app) => app.status === stage).length}
              </span>
              <button
                className="icon-button"
                aria-label={`Add application in ${stage}`}
                onClick={() => onEdit(applicationDraft(stage))}
              >
                <Plus size={16} />
              </button>
            </div>
            {applications
              .filter((app) => app.status === stage)
              .map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={app}
                  onOpen={() => onEdit(app)}
                />
              ))}
            {!applications.some((app) => app.status === stage) && (
              <div className="column-empty">
                <span>No applications yet</span>
              </div>
            )}
          </section>
        ))}
    </div>
  );
}
