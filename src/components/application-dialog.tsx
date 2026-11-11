"use client";
import { useState } from "react";
import { Application, applicationSchema, statuses } from "@/lib/models";
import { useWorkspace } from "./workspace-provider";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { ExternalLink, Trash2 } from "lucide-react";
export function ApplicationDialog({
  application,
  onClose,
}: {
  application: Application | null | undefined;
  onClose: () => void;
}) {
  const { save, remove, busy } = useWorkspace();
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const app = application;
  return (
    <Modal
      open={application !== undefined}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={app ? `${app.company} · Application` : "Track an application"}
      description="Keep the opportunity, notes, and next steps in one place."
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          const result = applicationSchema.safeParse({
            ...fields,
            id: app?.id || crypto.randomUUID(),
            created_at: app?.created_at || new Date().toISOString(),
          });
          if (!result.success) {
            setError(result.error.issues[0].message);
            return;
          }
          try {
            await save(result.data);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to save");
          }
        }}
      >
        <label>
          Company
          <input
            name="company"
            required
            maxLength={120}
            defaultValue={app?.company}
            placeholder="e.g. Linear"
          />
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
            defaultValue={app?.location || ""}
            placeholder="City or remote"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={app?.status || "Saved"}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
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
          <input name="source" defaultValue={app?.source || "Manual entry"} />
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
          Notes
          <textarea
            name="notes"
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
          {app && (
            <Button
              type="button"
              variant="ghost"
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
      {confirm && (
        <div className="confirm-box" role="alert">
          <p>
            Delete this application and its activity? This cannot be undone.
          </p>
          <div className="row">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep application
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                try {
                  await remove(app!.id);
                  onClose();
                } catch {
                  setError("Unable to delete. Please try again.");
                }
              }}
            >
              Delete application
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
