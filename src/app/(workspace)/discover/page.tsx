"use client";
import { useState } from "react";
import { Plus, Search, ArrowUpRight, Bookmark } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Application } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { ApplicationDialog } from "@/components/application-dialog";
import { JobCard, CompanyMark, Empty, dateLabel } from "@/components/shared";
export default function Discover() {
  const { data, isDemo, save, notify, busy } = useWorkspace();
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All types"),
    [details, setDetails] = useState<Application>(),
    [adding, setAdding] = useState(false);
  const library = [
    ...data.jobs,
    ...data.applications.filter(
      (application) =>
        !data.jobs.some(
          (job) =>
            job.company === application.company &&
            job.title === application.title,
        ),
    ),
  ];
  const jobs = library.filter(
    (j) =>
      `${j.title} ${j.company} ${j.location}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (type === "All types" || j.type === type),
  );
  const saved = (j: Application) =>
    data.applications.some(
      (a) => a.company === j.company && a.title === j.title,
    );
  async function saveJob(j: Application) {
    try {
      await save({
        ...j,
        id: crypto.randomUUID(),
        status: "Saved",
        created_at: new Date().toISOString(),
      });
    } catch {
      notify("Unable to save opportunity. Please try again.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIND YOUR DIRECTION</div>
          <h1>Your next opportunity</h1>
          <p>Find something that speaks to you. Save it. Make it happen.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={17} />
          Add opportunity
        </Button>
      </div>
      <div className="info-banner">
        {isDemo
          ? "Demo listings · These are sample opportunities, not live vacancies."
          : "Your opportunity library · Listings are manually curated; no live job feed is connected."}{" "}
        Manually added opportunities are also tracked in Applications. Match
        scoring is not connected.
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
        <span className="result-count">{jobs.length} opportunities</span>
      </div>
      <div className="job-grid discover-grid">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            saved={saved(job)}
            onSave={() => void saveJob(job)}
            onDetails={() => setDetails(job)}
          />
        ))}
      </div>
      {!jobs.length && (
        <Empty
          title="Room for new possibilities"
          description="Try another search, or add an opportunity you found elsewhere."
        />
      )}
      <Modal
        open={!!details}
        onOpenChange={(o) => {
          if (!o) setDetails(undefined);
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
                <dd>{details.source}</dd>
              </div>
              <div>
                <dt>Match score</dt>
                <dd>Not connected · AI matching is deferred</dd>
              </div>
            </dl>
            <p>
              {details.notes ||
                "Save this opportunity to track your application, add notes, and plan your next steps."}
            </p>
            <div className="form-actions">
              {details.url && (
                <Button asChild variant="outline">
                  <a
                    href={details.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit application page
                    <ArrowUpRight size={16} />
                  </a>
                </Button>
              )}
              <Button
                disabled={busy || saved(details)}
                onClick={() => void saveJob(details)}
              >
                <Bookmark size={16} />
                {saved(details) ? "Saved to applications" : "Save opportunity"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <ApplicationDialog
        application={adding ? null : undefined}
        onClose={() => setAdding(false)}
      />
    </>
  );
}
