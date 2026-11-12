"use client";
import { useId, useState } from "react";
import { Application, applicationSchema, statuses } from "@/lib/models";
import { applicationDraft } from "@/lib/business/tracking";
import { useWorkspace } from "./workspace-provider";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { ExternalLink, Trash2 } from "lucide-react";
import { dateLabel } from "./shared";
export function ApplicationDialog({
  application,
  onClose,
}: {
  application: Application | null | undefined;
  onClose: () => void;
}) {
  const { data, save, remove, busy } = useWorkspace();
  const companyList = useId();
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const app = application;
  const existing = !!app && data.applications.some((a) => a.id === app.id);
  const history = data.events.filter(
    (event) => event.application_id === app?.id,
  );
  return (
    <Modal
      open={application !== undefined}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={existing ? `${app.company} · Application` : "Track an application"}
      description="Keep the opportunity, notes, and next steps in one place."
    >
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          const company = data.companies.find(
            (company) =>
              company.name.toLowerCase() ===
              String(fields.company).trim().toLowerCase(),
          );
          const parsed = applicationSchema.safeParse({
            ...applicationDraft(),
            ...app,
            ...fields,
            company_id: company?.id || null,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          try {
            await save(parsed.data);
            onClose();
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to save");
          }
        }}
      >
        <label>
          Company
          <input
            name="company"
            required
            maxLength={120}
            list={companyList}
            defaultValue={app?.company}
            placeholder="Select a company or enter a new name"
          />
          <datalist id={companyList}>
            {data.companies.map((company) => (
              <option key={company.id} value={company.name} />
            ))}
          </datalist>
        </label>
        <label>
          Role
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={app?.title}
            placeholder="e.g. Software Engineer Intern"
          />
        </label>
        <label>
          Location
          <input
            name="location"
            maxLength={160}
            defaultValue={app?.location || ""}
            placeholder="City or remote"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={app?.status || "Saved"}>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          Job type
          <select name="type" defaultValue={app?.type || "Internship"}>
            <option>Internship</option>
            <option>Co-op</option>
            <option>Graduate</option>
          </select>
        </label>
        <label>
          Source
          <input
            name="source"
            maxLength={120}
            defaultValue={app?.source || "Manual entry"}
          />
        </label>
        <label>
          Application deadline
          <input
            type="date"
            name="deadline"
            defaultValue={app?.deadline || ""}
          />
        </label>
        <label>
          Date applied
          <input
            type="date"
            name="applied_on"
            defaultValue={app?.applied_on || ""}
          />
          <small>
            Defaults to today when first moving to a submitted stage.
          </small>
        </label>
        <label className="full-width">
          Next important date
          <input
            type="date"
            name="important_date"
            defaultValue={app?.important_date || ""}
          />
        </label>
        <label className="full-width">
          Application link
          <input
            type="url"
            name="url"
            defaultValue={app?.url || ""}
            placeholder="https://company.com/careers/…"
          />
        </label>
        <label className="full-width">
          Job description
          <textarea
            name="description"
            maxLength={20000}
            rows={3}
            defaultValue={app?.description || ""}
            placeholder="Responsibilities, requirements, and role details"
          />
        </label>
        <label className="full-width">
          Notes
          <textarea
            name="notes"
            maxLength={10000}
            rows={4}
            defaultValue={app?.notes || ""}
            placeholder="Contacts, preparation notes, and things to remember…"
          />
        </label>
        {error && (
          <p role="alert" className="error full-width">
            {error}
          </p>
        )}
        <div className="form-actions full-width">
          {existing && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          )}
          {app?.url && (
            <Button asChild variant="outline">
              <a href={app.url} target="_blank" rel="noopener noreferrer">
                Open listing
                <ExternalLink size={15} />
              </a>
            </Button>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save application"}
          </Button>
        </div>
      </form>
      {existing && (
        <section className="application-history">
          <h3>
            Application history
            {app.attempt > 1 ? ` · Attempt ${app.attempt}` : ""}
          </h3>
          {history.length ? (
            history.map((event) => (
              <div className="history-row" key={event.id}>
                <span>{event.description}</span>
                <time dateTime={event.created_at}>
                  {dateLabel(event.created_at)}
                </time>
              </div>
            ))
          ) : (
            <p>No recorded updates yet.</p>
          )}
        </section>
      )}
      {confirm && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open && !busy) setConfirm(false);
          }}
          title="Delete this application?"
          description="This permanently deletes the application and its activity history."
        >
          <div className="form-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep application
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                try {
                  await remove(app!.id);
                  onClose();
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "Unable to delete",
                  );
                  setConfirm(false);
                }
              }}
            >
              Delete application
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
