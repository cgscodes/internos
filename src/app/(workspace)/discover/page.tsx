"use client";
import { useState } from "react";
import { Plus, Search, ArrowUpRight, Bookmark, Pencil } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import type { Application, Job } from "@/lib/models";
import { applicationDraft } from "@/lib/business/tracking";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { ApplicationDialog } from "@/components/application-dialog";
import { JobDialog } from "@/components/job-dialog";
import { JobCard, CompanyMark, Empty, dateLabel } from "@/components/shared";
export default function Discover() {
  const { data, bookmark, busy } = useWorkspace();
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All types"),
    [scope, setScope] = useState("All opportunities"),
    [details, setDetails] = useState<Job>(),
    [editing, setEditing] = useState<Job | null | undefined>(),
    [application, setApplication] = useState<Application>();
  const jobs = data.jobs.filter(
    (job) =>
      `${job.title} ${job.company} ${job.location}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (type === "All types" || job.type === type) &&
      (scope === "All opportunities" || data.bookmarks.includes(job.id)),
  );
  const activeApplication =
    details &&
    data.applications.find(
      (app) =>
        app.job_id === details.id &&
        !["Rejected", "Withdrawn"].includes(app.status),
    );
  const canEdit = details?.created_by === data.identity?.id;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIND YOUR DIRECTION</div>
          <h1>Your next opportunity</h1>
          <p>Find something that speaks to you. Save it. Make it happen.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Add opportunity
        </Button>
      </div>
      <div className="info-banner">
        Your opportunity library · Manual postings and the shared catalog. No
        automated feed or AI match scoring is connected. Bookmark a job, then
        start an application from its details.
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles, companies, or locations…"
            aria-label="Search opportunities"
          />
        </label>
        <select
          aria-label="Filter job type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option>All types</option>
          <option>Internship</option>
          <option>Co-op</option>
          <option>Graduate</option>
        </select>
        <select
          aria-label="Filter bookmarks"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option>All opportunities</option>
          <option>Bookmarked</option>
        </select>
        <span className="result-count">{jobs.length} opportunities</span>
      </div>
      <div className="job-grid discover-grid">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            saved={data.bookmarks.includes(job.id)}
            busy={busy}
            onSave={() => {
              void bookmark(job.id, !data.bookmarks.includes(job.id)).catch(
                () => {},
              );
            }}
            onDetails={() => setDetails(job)}
          />
        ))}
      </div>
      {!jobs.length && (
        <Empty
          title="Room for new possibilities"
          description="Try another search, or add a real opportunity you found elsewhere."
        />
      )}
      <Modal
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(undefined);
        }}
        title={details?.title || "Opportunity"}
        description={
          details ? `${details.company} · ${details.location}` : undefined
        }
      >
        {details && (
          <div className="detail-content">
            <CompanyMark name={details.company} />
            <dl>
              <div>
                <dt>Company</dt>
                <dd>{details.company}</dd>
              </div>
              <div>
                <dt>Job type</dt>
                <dd>{details.type}</dd>
              </div>
              <div>
                <dt>Application deadline</dt>
                <dd>
                  {details.deadline
                    ? dateLabel(details.deadline)
                    : "Not specified"}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{details.source || "Not specified"}</dd>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd>
                  {details.created_by
                    ? "Private opportunity"
                    : "Shared catalog · read-only"}
                </dd>
              </div>
            </dl>
            <p className="preserve-lines">
              {details.description || "No job description provided."}
            </p>
            <div className="form-actions">
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(details);
                    setDetails(undefined);
                  }}
                >
                  <Pencil size={16} />
                  Edit opportunity
                </Button>
              )}
              {details.url && (
                <Button asChild variant="outline">
                  <a
                    href={details.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Original posting
                    <ArrowUpRight size={16} />
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void bookmark(
                    details.id,
                    !data.bookmarks.includes(details.id),
                  ).catch(() => {});
                }}
              >
                <Bookmark size={16} />
                {data.bookmarks.includes(details.id)
                  ? "Remove bookmark"
                  : "Bookmark opportunity"}
              </Button>
              <Button
                onClick={() => {
                  setApplication(
                    activeApplication || applicationDraft("Saved", details),
                  );
                  setDetails(undefined);
                }}
              >
                {activeApplication
                  ? "View application"
                  : data.applications.some((app) => app.job_id === details.id)
                    ? "Reapply to this job"
                    : "Start application"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <JobDialog
        key={editing?.id || String(editing)}
        job={editing}
        onClose={() => setEditing(undefined)}
      />
      <ApplicationDialog
        key={application?.id || "closed"}
        application={application}
        onClose={() => setApplication(undefined)}
      />
    </>
  );
}
