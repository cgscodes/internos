"use client";
import { useRef, useState } from "react";
import {
  FileText,
  Upload,
  LockKeyhole,
  Download,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Empty, dateLabel } from "@/components/shared";
export default function Resumes() {
  const { data, isDemo, reload } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [parent, setParent] = useState("");
  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (parent) body.set("parent_id", parent);
      const res = await fetch("/api/resumes", { method: "POST", body });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PUT YOUR BEST SELF FORWARD</div>
          <h1>A home for your resumes</h1>
          <p>
            Your experience, thoughtfully organized. Ready for the right
            opportunity.
          </p>
        </div>
        <Button
          disabled={isDemo || busy}
          onClick={() => {
            setParent("");
            input.current?.click();
          }}
        >
          <Upload size={17} />
          {busy ? "Uploading…" : "Upload resume"}
        </Button>
      </div>
      {isDemo && (
        <div className="info-banner">
          Private uploads require a connected Supabase account. Demo mode does
          not store documents.
        </div>
      )}
      <input
        type="file"
        hidden
        ref={input}
        accept=".pdf,.docx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="resume-layout">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Your documents</h2>
              <p>A master resume and every version along the way.</p>
            </div>
            <span className="count-badge">{data.resumes.length}</span>
          </div>
          {data.resumes.length ? (
            data.resumes.map((resume) => (
              <div className="resume-row" key={resume.id}>
                <span className="document-icon">
                  <FileText size={24} />
                </span>
                <div className="resume-info">
                  <strong>{resume.name}</strong>
                  <small>
                    {resume.file_name} · {Math.ceil(resume.size / 1024)} KB ·{" "}
                    {dateLabel(resume.created_at)}
                  </small>
                  <span className="resume-badge">
                    {resume.is_master
                      ? "Master resume"
                      : resume.parent_id
                        ? "Resume version"
                        : "Resume"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Download ${resume.name}`}
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/resumes?id=${resume.id}`);
                      const j = await r.json();
                      if (!r.ok) throw new Error(j.error);
                      window.open(j.url, "_blank", "noopener,noreferrer");
                    } catch {
                      setError("Unable to download resume. Try again.");
                    }
                  }}
                >
                  <Download size={18} />
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setParent(resume.id);
                    input.current?.click();
                  }}
                >
                  <GitBranch size={16} />
                  <span>New version</span>
                </Button>
              </div>
            ))
          ) : (
            <Empty
              title="Start with your story"
              description="Upload your master resume as a PDF or DOCX. Your first upload becomes your master resume."
            />
          )}
          <div className="upload-hint">
            <LockKeyhole size={15} />
            Private storage · PDF or DOCX · Up to 5 MB
          </div>
        </section>
        <aside className="panel resume-aside">
          <ShieldCheck size={28} />
          <h2>Yours, and only yours.</h2>
          <p>
            Your documents live in private storage. Downloads use short-lived
            links, and every request checks your account.
          </p>
          <hr />
          <GitBranch size={24} />
          <h3>Make room for every version.</h3>
          <p>
            Keep your master resume intact and upload versions for specific
            roles.
          </p>
          <span className="subtle-label">AI TAILORING · COMING LATER</span>
          <p>
            Tailored resume generation will follow the secure profile and
            document foundation.
          </p>
        </aside>
      </div>
    </>
  );
}
