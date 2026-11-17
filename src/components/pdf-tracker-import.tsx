"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
import { statuses } from "@/lib/models";
import { PDF_LIMITS } from "@/lib/pdf/job-fields";
import {
  importFieldsSchema,
  prepareSelectedImports,
  reviewImportRow,
  matchingApplication,
  parseTracker,
  type ImportRow,
} from "@/lib/pdf/tracker";

export function PdfTrackerImport() {
  const { data, reload } = useWorkspace();
  const [rows, setRows] = useState<ImportRow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const update = (id: string, patch: Partial<ImportRow>) =>
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const duplicate = (row: ImportRow) =>
    matchingApplication(row, data.applications) ||
    data.imports?.find((receipt) => receipt.import_key === row.import_key);
  const duplicates = rows.map(duplicate);
  const valid = rows.filter((row) => importFieldsSchema.safeParse(row).success);
  const selected = rows.filter((row) => row.selected);
  const eligibleSelected = selected.filter(
    (row) => reviewImportRow(row).eligible,
  );
  const { ready } = prepareSelectedImports(rows);
  async function extract(files: File[]) {
    setBusy(true);
    setError("");
    setMessages([]);
    setProgress(null);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      if (
        files.length > 10 ||
        files.reduce((sum, f) => sum + f.size, 0) > 50 * 1024 * 1024
      )
        throw new Error("Choose up to 10 PDFs, 50 MB total.");
      const session = await fetch("/api/workspace", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!session.ok)
        throw new Error(
          session.status === 401
            ? "Sign in again before importing."
            : "Unable to verify your session.",
        );
      const next: ImportRow[] = [];
      for (const file of files) {
        if (
          !/\.pdf$/i.test(file.name) ||
          (file.type && file.type !== "application/pdf") ||
          file.size > PDF_LIMITS.bytes
        )
          throw new Error("Choose PDFs up to 10 MB each.");
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const hash = await crypto.subtle.digest("SHA-256", bytes);
          const fingerprint = Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          const { extractPdfLayout } = await import("@/lib/pdf/extract");
          const parsed = parseTracker(
            (await extractPdfLayout(bytes, controller.signal, true)).pages,
            fingerprint,
          );
          if (!parsed.length)
            setMessages((previous) => [
              ...previous,
              `${file.name}: No recognizable company/role table found. Use individual posting mode or export a table with visible column headers.`,
            ]);
          next.push(...parsed);
          if (next.length > 500)
            throw new Error("Import no more than 500 rows per session.");
        } catch (error) {
          if (controller.signal.aborted) throw error;
          setMessages((previous) => [
            ...previous,
            `${file.name}: ${error instanceof Error ? error.message : "Unable to extract PDF"}`,
          ]);
        }
      }
      if (controller.signal.aborted)
        throw new Error("Import cancelled or timed out.");
      if (next.length > 500)
        throw new Error("Import no more than 500 rows per session.");
      const seen = new Set<string>();
      setRows(
        next.filter((row) => {
          if (seen.has(row.import_key)) return false;
          seen.add(row.import_key);
          return true;
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to read PDFs.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      abort.current = null;
    }
  }
  async function save() {
    setError("");
    setMessages([]);
    if (!selected.length) {
      setError("Select at least one row to import.");
      return;
    }
    const { ready, skipped } = prepareSelectedImports(rows);
    const outcomes = skipped.map(
      ({ index, row, errors }) =>
        `Row ${index + 1} · ${row.company || "Unknown company"} · ${row.title || "Unknown role"}: not imported — ${errors.join(" ")}`,
    );
    setMessages(outcomes);
    if (!ready.length) {
      setError(
        "No selected rows are eligible and confirmed. Correct the rows marked Needs attention or confirm your selection.",
      );
      return;
    }
    setProgress({ completed: 0, total: ready.length });
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      // Bounded chunks provide actual completed-row progress and retain successes
      // if a later request fails. The existing RPC remains atomic per application.
      for (let offset = 0; offset < ready.length; offset += 20) {
        const chunk = ready.slice(offset, offset + 20);
        const response = await fetch("/api/import/applications", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk.map((item) => item.data) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Import failed");
        const complete = new Set<string>();
        for (const item of result.results as {
          row: number;
          outcome: string;
          error?: string;
        }[]) {
          const { row, index } = chunk[item.row];
          if (item.outcome !== "error") complete.add(row.id);
          outcomes.push(
            `Row ${index + 1} · ${row.company} · ${row.title}: ${item.error || item.outcome}`,
          );
        }
        setRows((previous) =>
          previous.map((row) =>
            complete.has(row.id) ? { ...row, selected: false } : row,
          ),
        );
        setMessages([...outcomes]);
        setProgress({ completed: offset + chunk.length, total: ready.length });
      }
      await reload();
    } catch (error) {
      await reload().catch(() => {});
      setError(
        controller.signal.aborted
          ? "Import timed out. Refresh your workspace before retrying. Confirmed rows are safe to retry."
          : error instanceof Error
            ? error.message
            : "Import failed",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
      abort.current = null;
    }
  }
  return (
    <div className="detail-content bulk-import">
      <label>
        Application tracker PDFs
        <input
          type="file"
          multiple
          accept=".pdf,application/pdf"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) void extract(files);
            event.target.value = "";
          }}
        />
      </label>
      <p>
        Up to 10 PDFs, 10 MB each, 50 MB total · 40 pages per file · 500 rows.
        Truncated text can be imported as shown. Check the selection and confirm
        before saving.
      </p>
      {busy && (
        <p role="status">
          {progress
            ? `Importing ${progress.completed} of ${progress.total} eligible applications…`
            : "Processing import…"}
        </p>
      )}
      {progress && (
        <label>
          Application import progress
          <progress
            aria-label="Application import progress"
            max={progress.total}
            value={progress.completed}
          />
          {progress.completed} / {progress.total}
        </label>
      )}
      {rows.length > 0 && (
        <>
          <p role="status">
            Detected {rows.length} · Valid {valid.length} · Duplicate{" "}
            {duplicates.filter(Boolean).length} · Invalid{" "}
            {rows.length - valid.length} · Selected {selected.length} · Ready to
            import {ready.length}
          </p>
          <div className="form-actions">
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                setRows((previous) =>
                  previous.map((row) => ({ ...row, selected: true })),
                )
              }
            >
              Select All
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                setRows((previous) =>
                  previous.map((row) => ({ ...row, selected: false })),
                )
              }
            >
              Deselect All
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                setRows((previous) =>
                  previous.map((row) => ({
                    ...row,
                    selected:
                      importFieldsSchema.safeParse(row).success &&
                      !duplicate(row),
                  })),
                )
              }
            >
              Select all valid rows
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                setRows((previous) =>
                  previous.map((row) => ({
                    ...row,
                    selected: row.selected && !duplicate(row),
                  })),
                )
              }
            >
              Skip duplicates
            </Button>
          </div>
          <label>
            Review filter
            <select
              disabled={busy}
              value={attentionOnly ? "attention" : "all"}
              onChange={(event) =>
                setAttentionOnly(event.target.value === "attention")
              }
            >
              <option value="all">All rows</option>
              <option value="attention">Needs attention</option>
            </select>
          </label>
          <label>
            Job type for selected rows
            <select
              disabled={busy}
              value=""
              onChange={(event) => {
                const type = event.target.value as ImportRow["type"];
                if (type)
                  setRows((previous) =>
                    previous.map((row) =>
                      row.selected ? { ...row, type, reviewed: false } : row,
                    ),
                  );
              }}
            >
              <option value="">Choose and apply a type</option>
              {["Internship", "Co-op", "Graduate"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy || !eligibleSelected.length}
              checked={
                eligibleSelected.length > 0 &&
                eligibleSelected.every((row) => row.reviewed)
              }
              onChange={(event) => {
                const reviewed = event.target.checked;
                setRows((previous) =>
                  previous.map((row) =>
                    row.selected && reviewImportRow(row).eligible
                      ? { ...row, reviewed }
                      : row,
                  ),
                );
              }}
            />
            Confirm selected eligible rows
          </label>
          <fieldset disabled={busy} className="bulk-review-fields">
            <div className="flow-table-wrap">
              <table className="bulk-review-table">
                <caption>
                  Review extracted applications. Warnings do not block import.
                  Rows needing attention stay available for correction.
                </caption>
                <thead>
                  <tr>
                    {[
                      "Include",
                      "Company",
                      "Job title",
                      "Date applied",
                      "Location",
                      "Imported status",
                      "Job type",
                      "Existing-record match",
                      "Warnings and errors",
                      "Import eligibility",
                      "Reviewed",
                      "Remove",
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const review = reviewImportRow(row);
                    if (attentionOnly && !review.needsAttention) return null;
                    return (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Include row ${index + 1}`}
                            checked={row.selected}
                            onChange={(event) =>
                              update(row.id, { selected: event.target.checked })
                            }
                          />
                        </td>
                        {(
                          [
                            "company",
                            "title",
                            "applied_on",
                            "location",
                          ] as const
                        ).map((field) => (
                          <td key={field}>
                            <input
                              aria-label={`${field} row ${index + 1}`}
                              type={field === "applied_on" ? "date" : "text"}
                              maxLength={field === "company" ? 120 : 160}
                              value={row[field]}
                              onChange={(event) =>
                                update(row.id, {
                                  [field]: event.target.value,
                                  reviewed: false,
                                })
                              }
                            />
                            {field === "applied_on" &&
                              row.source_applied_on && (
                                <small>
                                  Source date: {row.source_applied_on}
                                </small>
                              )}
                          </td>
                        ))}
                        <td>
                          <small>
                            Source: {row.source_status || "Missing"}
                          </small>
                          <select
                            aria-label={`Status row ${index + 1}`}
                            value={row.status}
                            onChange={(event) =>
                              update(row.id, {
                                status: event.target
                                  .value as ImportRow["status"],
                                reviewed: false,
                              })
                            }
                          >
                            <option value="">Choose mapping</option>
                            {statuses.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label={`Job type row ${index + 1}`}
                            value={row.type}
                            onChange={(event) =>
                              update(row.id, {
                                type: event.target.value as ImportRow["type"],
                                reviewed: false,
                              })
                            }
                          >
                            <option value="">Unknown / Not specified</option>
                            {["Internship", "Co-op", "Graduate"].map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label={`Match job row ${index + 1}`}
                            value={row.job_id || ""}
                            onChange={(event) => {
                              const job = data.jobs.find(
                                (j) => j.id === event.target.value,
                              );
                              update(
                                row.id,
                                job
                                  ? {
                                      job_id: job.id,
                                      company: job.company,
                                      title: job.title,
                                      location: job.location,
                                      type: job.type,
                                      reviewed: false,
                                    }
                                  : { job_id: null, reviewed: false },
                              );
                            }}
                          >
                            <option value="">Find or create from fields</option>
                            {data.jobs.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.company} · {job.title} · {job.location}
                              </option>
                            ))}
                          </select>
                          <small>
                            {duplicates[index]
                              ? "Existing application · will skip"
                              : "No application match"}
                          </small>
                        </td>
                        <td>
                          {review.warnings.length > 0 && (
                            <details>
                              <summary>
                                {review.warnings.length} warnings
                              </summary>
                              <ul>
                                {review.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {review.errors.map((message) => (
                            <p className="error" key={message}>
                              Row {index + 1}: {message}
                            </p>
                          ))}
                          <small>Page {row.page}</small>
                        </td>
                        <td>
                          {!review.eligible
                            ? "Needs attention"
                            : row.reviewed
                              ? "Ready to import"
                              : "Needs confirmation"}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Confirm review row ${index + 1}`}
                            checked={row.reviewed}
                            onChange={(event) =>
                              update(row.id, { reviewed: event.target.checked })
                            }
                          />
                          <small>
                            {row.reviewed ? "Confirmed" : "Needs review"}
                          </small>
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setRows((previous) =>
                                previous.filter((r) => r.id !== row.id),
                              )
                            }
                          >
                            Remove row {index + 1}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
          <Button disabled={busy || !ready.length} onClick={() => void save()}>
            Import Selected
          </Button>
        </>
      )}
      {busy && (
        <Button variant="outline" onClick={() => abort.current?.abort()}>
          Cancel processing
        </Button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {messages.length > 0 && (
        <div role="status">
          {messages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
