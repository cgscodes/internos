"use client";
import { useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Application, statuses } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { ApplicationDialog } from "@/components/application-dialog";
import { CompanyMark, Empty, Status, dateLabel } from "@/components/shared";
export default function Applications() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("All statuses"),
    [editing, setEditing] = useState<Application | null | undefined>();
  const apps = data.applications.filter(
    (a) =>
      `${a.company} ${a.title}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All statuses" || status === a.status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY STEP, IN ONE PLACE</div>
          <h1>Your applications</h1>
          <p>From first save to final offer. Keep your next move in view.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Add application
        </Button>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or role…"
            aria-label="Search applications"
          />
        </label>
        <label className="select-filter">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option>All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="result-count">{apps.length} applications</span>
      </div>
      <div
        className="kanban"
        role="region"
        aria-label="Applications grouped by status"
        tabIndex={0}
      >
        {statuses
          .filter((s) => status === "All statuses" || s === status)
          .map((s) => (
            <section className="kanban-column" key={s}>
              <div className="kanban-heading">
                <Status value={s} />
                <span>{apps.filter((a) => a.status === s).length}</span>
                <button
                  className="icon-button"
                  aria-label={`Add application in ${s}`}
                  onClick={() =>
                    setEditing({
                      id: crypto.randomUUID(),
                      company: "",
                      title: "",
                      location: "",
                      type: "Internship",
                      source: "Manual entry",
                      url: "",
                      deadline: "",
                      notes: "",
                      important_date: "",
                      created_at: new Date().toISOString(),
                      status: s,
                    })
                  }
                >
                  <Plus size={16} />
                </button>
              </div>
              {apps
                .filter((a) => a.status === s)
                .map((a) => (
                  <button
                    key={a.id}
                    className="application-card"
                    onClick={() => setEditing(a)}
                  >
                    <div className="row">
                      <CompanyMark name={a.company} />
                      <strong>{a.company}</strong>
                    </div>
                    <h3>{a.title}</h3>
                    <p>{a.location || "Location not specified"}</p>
                    <div className="application-card-footer">
                      <span>
                        {a.deadline
                          ? `Due ${dateLabel(a.deadline)}`
                          : "No deadline"}
                      </span>
                      <span>↗</span>
                    </div>
                  </button>
                ))}
              {!apps.some((a) => a.status === s) && (
                <div className="column-empty">No applications yet</div>
              )}
            </section>
          ))}
      </div>
      {!apps.length && (
        <Empty
          title="Make your first move"
          description="Add an application, or adjust your filters to see your opportunities."
        />
      )}
      <ApplicationDialog
        key={editing?.id || String(editing)}
        application={editing}
        onClose={() => setEditing(undefined)}
      />
    </>
  );
}
