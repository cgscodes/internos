"use client";
import { useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Application, statuses } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { ApplicationDialog } from "@/components/application-dialog";
import { Empty } from "@/components/shared";
import { PageHeader } from "@/components/design/page";
import { GlassSurface } from "@/components/design/glass";
import { PipelineBoard, ViewSelector } from "@/components/design/pipeline";
export default function Applications() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("All statuses"),
    [view, setView] = useState<"board" | "list">("board"),
    [editing, setEditing] = useState<Application | null | undefined>();
  const apps = data.applications.filter(
    (app) =>
      `${app.company} ${app.title}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || app.status === status),
  );
  return (
    <>
      <PageHeader
        eyebrow="FROM FIRST SAVE TO FINAL OFFER"
        title="Your applications"
        description="Every opportunity has a next step. Keep yours in view."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus size={18} />
            Add application
          </Button>
        }
      />
      <GlassSurface className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company or role…"
            aria-label="Search applications"
          />
        </label>
        <label className="select-filter">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>All statuses</option>
            {statuses.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <span className="result-count">{apps.length} applications</span>
        <ViewSelector view={view} onChange={setView} />
      </GlassSurface>
      <PipelineBoard
        applications={apps}
        status={status}
        view={view}
        onEdit={setEditing}
      />
      {!apps.length && (
        <div className="panel">
          <Empty
            title="Make your first move"
            description="Add an application, or adjust your filters to see your opportunities."
          />
        </div>
      )}
      <ApplicationDialog
        key={editing?.id || String(editing)}
        application={editing}
        onClose={() => setEditing(undefined)}
      />
    </>
  );
}
