"use client";
import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { useWorkspace } from "./workspace-provider";
import { jobSchema, type Job, type Workspace } from "@/lib/models";
import {
  PDF_LIMITS,
  parseJobText,
  type ImportedJob,
} from "@/lib/pdf/job-fields";

export function PdfJobImport({
  onApplication,
}: {
  onApplication: (job: Job) => void;
}) {
  const { reload, notify } = useWorkspace();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<ImportedJob>();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function close() {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setOpen(false);
    setDraft(undefined);
    setError("");
  }
  async function extract(file: File) {
    setError("");
    setBusy(true);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      if (!file.size || file.size > PDF_LIMITS.bytes)
        throw new Error("Choose a PDF up to 10 MB.");
      // Verify the session before processing; private PDF bytes never leave this device.
      const session = await fetch("/api/workspace", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (session.status === 401) {
        window.location.replace(
          new URL("/login?error=session_expired", window.location.origin).href,
        );
        return;
      }
      if (!session.ok)
        throw new Error("Unable to verify your session. Try again.");
      const result = await Promise.race([
        (async () => {
          const { extractPdfText } = await import("@/lib/pdf/extract");
          return extractPdfText(
            new Uint8Array(await file.arrayBuffer()),
            controller.signal,
          );
        })(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () =>
              reject(
                new Error(
                  "Import timed out. Check your connection or try a shorter PDF.",
                ),
              ),
            { once: true },
          );
        }),
      ]);
      if (!controller.signal.aborted) setDraft(parseJobText(result));
    } catch (e) {
      if (abort.current === controller)
        setError(
          controller.signal.aborted
            ? "Import timed out. Check your connection or try a shorter PDF."
            : e instanceof Error
              ? e.message
              : "Unable to read this PDF.",
        );
    } finally {
      clearTimeout(timer);
      if (abort.current === controller) {
        setBusy(false);
        abort.current = null;
      }
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        <FileUp size={18} />
        Import PDF
      </Button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!value && !busy) close();
        }}
        title={draft ? "Review imported job" : "Import a job PDF"}
        description="Selectable-text PDFs up to 10 MB. Your file stays on this device; only reviewed job details are saved."
      >
        {!draft ? (
          <div className="detail-content">
            <label>
              Job description PDF
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void extract(file);
                  event.target.value = "";
                }}
              />
            </label>
            <p>
              Exports from Handshake, LinkedIn, and career websites work when
              they contain selectable text. No OCR or AI is used.
            </p>
            {busy && <p role="status">Reading PDF…</p>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button variant="outline" onClick={close}>
                {busy ? "Cancel import" : "Cancel"}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              const intent = (
                (event.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null
              )?.value;
              const fields = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              const salary = String(fields.salary || "").trim();
              const result = jobSchema.safeParse({
                ...fields,
                id: crypto.randomUUID(),
                company_id: null,
                source: "PDF import",
                description: salary
                  ? `Salary (reviewed): ${salary}\n\n${fields.description}`
                  : fields.description,
              });
              if (!result.success) {
                setError(result.error.issues[0].message);
                return;
              }
              setBusy(true);
              const saveController = new AbortController();
              const saveTimeout = setTimeout(
                () => saveController.abort(),
                30000,
              );
              try {
                const response = await fetch("/api/workspace", {
                  method: "POST",
                  signal: saveController.signal,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "job.create",
                    data: result.data,
                  }),
                });
                if (response.status === 401) {
                  window.location.replace(
                    new URL(
                      "/login?error=session_expired",
                      window.location.origin,
                    ).href,
                  );
                  return;
                }
                const workspace: Workspace & { error?: string } =
                  await response.json();
                if (!response.ok)
                  throw new Error(
                    workspace.error || "Unable to save job. Try again.",
                  );
                // The existing transaction may return an already-existing job with a different ID.
                const normal = (value: string) => value.trim().toLowerCase();
                const saved =
                  workspace.jobs.find((job) => job.id === result.data.id) ||
                  workspace.jobs.find(
                    (job) =>
                      job.created_by === workspace.identity?.id &&
                      normal(job.company) === normal(result.data.company) &&
                      normal(job.title) === normal(result.data.title) &&
                      normal(job.location) === normal(result.data.location) &&
                      job.url === result.data.url,
                  );
                if (!saved)
                  throw new Error(
                    "Job saved. Open it in Discover to continue.",
                  );
                await reload();
                notify(
                  saved.id === result.data.id
                    ? "Job imported"
                    : "Job already exists. Existing details were kept.",
                );
                close();
                if (intent === "application") onApplication(saved);
              } catch (e) {
                setError(
                  saveController.signal.aborted
                    ? "Save timed out. Check Discover before retrying; the job may have saved."
                    : e instanceof Error
                      ? e.message
                      : "Unable to save job.",
                );
              } finally {
                clearTimeout(saveTimeout);
                setBusy(false);
              }
            }}
          >
            <p className="full-width import-review-note">
              All extracted fields need your review. Missing fields are marked
              below. The description keeps the extracted text; salary is saved
              with it.
            </p>
            {(
              [
                ["company", "Company", 120],
                ["title", "Job title", 160],
                ["location", "Location", 160],
              ] as const
            ).map(([name, label, max]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  required={name !== "location"}
                  maxLength={max}
                  defaultValue={draft[name]}
                />
                <small className="subtle-label">
                  {draft[name]
                    ? "Check extracted value"
                    : "Missing · enter manually"}
                </small>
              </label>
            ))}
            <label>
              Employment type
              <select name="type" required defaultValue={draft.type}>
                <option value="" disabled>
                  Select a supported type
                </option>
                <option>Internship</option>
                <option>Co-op</option>
                <option>Graduate</option>
              </select>
              <small className="subtle-label">
                {draft.type
                  ? "Check extracted value"
                  : "Missing or unsupported · choose manually"}
              </small>
            </label>
            <label>
              Deadline
              <input
                name="deadline"
                type="date"
                defaultValue={draft.deadline}
              />
              <small className="subtle-label">
                {draft.deadline
                  ? "Check extracted date"
                  : "Missing or ambiguous · optional"}
              </small>
            </label>
            <label>
              Salary
              <input
                name="salary"
                maxLength={240}
                defaultValue={draft.salary}
              />
              <small className="subtle-label">
                {draft.salary
                  ? "Check currency and pay period"
                  : "Missing · optional"}
              </small>
            </label>
            <label className="full-width">
              Source URL
              <input
                name="url"
                type="url"
                maxLength={2000}
                defaultValue={draft.url}
              />
              <small className="subtle-label">
                {draft.url
                  ? "Verify original posting link"
                  : "Missing or multiple URLs · optional"}
              </small>
            </label>
            <label className="full-width">
              Full job description
              <textarea
                name="description"
                required
                rows={8}
                maxLength={19000}
                defaultValue={draft.description}
              />
            </label>
            {error && (
              <p className="error full-width" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions full-width">
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </Button>
              <Button type="submit" value="save" disabled={busy}>
                Save job
              </Button>
              <Button type="submit" value="application" disabled={busy}>
                Save & start application
              </Button>
            </div>
            {busy && (
              <p role="status" className="full-width">
                Saving reviewed job…
              </p>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
