"use client";
import { useId, useState } from "react";
import type { Job } from "@/lib/models";
import { jobSchema } from "@/lib/models";
import { useWorkspace } from "./workspace-provider";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
export function JobDialog({
  job,
  onClose,
}: {
  job: Job | null | undefined;
  onClose: () => void;
}) {
  const { data, saveJob, busy } = useWorkspace();
  const list = useId();
  const [error, setError] = useState("");
  return (
    <Modal
      open={job !== undefined}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={job ? "Edit opportunity" : "Add opportunity"}
      description="Save a real posting you found. New opportunities are private to your account."
    >
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          const company = data.companies.find(
            (c) =>
              c.name.toLowerCase() ===
              String(fields.company).trim().toLowerCase(),
          );
          const result = jobSchema.safeParse({
            ...fields,
            id: job?.id || crypto.randomUUID(),
            company_id: company?.id || null,
          });
          if (!result.success) {
            setError(result.error.issues[0].message);
            return;
          }
          try {
            await saveJob(result.data);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Unable to save opportunity",
            );
          }
        }}
      >
        <label>
          Company
          <input
            name="company"
            required
            list={list}
            maxLength={120}
            defaultValue={job?.company}
            placeholder="Select or create a company"
          />
          <datalist id={list}>
            {data.companies.map((c) => (
              <option value={c.name} key={c.id} />
            ))}
          </datalist>
        </label>
        <label>
          Role
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={job?.title}
          />
        </label>
        <label>
          Location
          <input
            name="location"
            maxLength={160}
            defaultValue={job?.location || ""}
          />
        </label>
        <label>
          Job type
          <select name="type" defaultValue={job?.type || "Internship"}>
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
            defaultValue={job?.source || "Manual entry"}
          />
        </label>
        <label>
          Application deadline
          <input
            name="deadline"
            type="date"
            defaultValue={job?.deadline || ""}
          />
        </label>
        <label className="full-width">
          Original posting URL
          <input
            name="url"
            type="url"
            defaultValue={job?.url || ""}
            placeholder="https://company.com/careers/…"
          />
        </label>
        <label className="full-width">
          Job description
          <textarea
            name="description"
            maxLength={20000}
            rows={5}
            defaultValue={job?.description || ""}
          />
        </label>
        {error && (
          <p className="error full-width" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions full-width">
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save opportunity"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
