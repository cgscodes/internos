"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
import type { MatchAnalysis } from "@/lib/ai/contracts";

export function JobMatchPanel({
  jobId,
  saved,
}: {
  jobId: string;
  saved: boolean;
}) {
  const { data, isDemo } = useWorkspace();
  const [resumeId, setResumeId] = useState("");
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [cached, setCached] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!resumeId || !saved || isDemo) return;
    const controller = new AbortController();
    void fetch(`/api/ai/match?job_id=${jobId}&resume_id=${resumeId}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setAnalysis(result.analysis);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load saved analysis.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [jobId, resumeId, saved, isDemo]);

  async function analyze(refresh: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/api/ai/match", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, resume_id: resumeId, refresh }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to analyze match.");
      setAnalysis(result.analysis);
      setCached(result.cached);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Unable to analyze match.",
        );
      else setError("Analysis timed out. Wait briefly, then try again.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      abort.current = null;
    }
  }
  const findings = analysis?.findings;
  return (
    <section className="match-panel" aria-labelledby={`match-heading-${jobId}`}>
      <div className="section-heading">
        <div>
          <h2 id={`match-heading-${jobId}`}>Resume match</h2>
          <p>A closer look at your documented fit.</p>
        </div>
      </div>
      {!saved ? (
        <p>Bookmark this opportunity to analyze a match.</p>
      ) : !data.resumes.length ? (
        <p>
          <Link href="/resumes">Upload a resume</Link> to compare your
          experience with this job.
        </p>
      ) : (
        <>
          <label htmlFor={`match-resume-${jobId}`}>Resume version</label>
          <select
            id={`match-resume-${jobId}`}
            value={resumeId}
            disabled={busy || isDemo}
            onChange={(event) => {
              setAnalysis(null);
              setError("");
              setCached(false);
              setLoading(Boolean(event.target.value));
              setResumeId(event.target.value);
            }}
          >
            <option value="">Select a saved resume</option>
            {data.resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name} ·{" "}
                {new Date(resume.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          <p className="match-note">
            Analyze sends text from this resume and the job description to
            Google Gemini. Common contact details are removed where recognized.
            Matching currently supports selectable-text PDFs.
          </p>
          <Button
            disabled={!resumeId || busy || loading || isDemo}
            onClick={() => void analyze(false)}
          >
            {busy ? "Analyzing match…" : "Analyze Match"}
          </Button>
        </>
      )}
      {(busy || loading) && (
        <p role="status">
          {busy
            ? "Comparing documented skills, experience, and stated requirements…"
            : "Loading saved analysis…"}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && !analysis && !busy && !loading && resumeId && !error && (
        <p>
          No saved analysis for this resume and job. Analyze when you’re ready.
        </p>
      )}
      {saved && analysis && findings && (
        <div className="match-findings">
          <div className="match-overview">
            <strong className="match-score">
              {analysis.match_score}
              <small> / 100</small>
            </strong>
            <span className="count-badge">
              Eligibility: {findings.eligibility_status}
            </span>
          </div>
          <p className="match-note">
            Heuristic fit estimate · Not a hiring probability or ATS score.
            Missing evidence does not mean you lack experience.
          </p>
          <p className="match-note">
            Analyzed{" "}
            <time dateTime={analysis.created_at}>
              {new Date(analysis.created_at).toLocaleString()}
            </time>
            {cached ? " · Cached result" : " · Saved snapshot"}. Analyze Match
            checks for content changes.
          </p>
          <h3>Strengths</h3>
          <h4>Relevant skills</h4>
          {findings.relevant_skills.length ? (
            <ul>
              {findings.relevant_skills.map((item, index) => (
                <li key={index}>
                  {item.finding}
                  <small>Resume evidence: “{item.resume_evidence}”</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No direct skill evidence identified.</p>
          )}
          <h4>Relevant experience</h4>
          {findings.relevant_experience.length ? (
            <ul>
              {findings.relevant_experience.map((item, index) => (
                <li key={index}>
                  {item.finding}
                  <small>Resume evidence: “{item.resume_evidence}”</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No direct experience evidence identified.</p>
          )}
          <h3>Qualifications not evidenced in this resume</h3>
          {findings.missing_qualifications.length ? (
            <ul>
              {findings.missing_qualifications.map((item, index) => (
                <li key={index}>{item.requirement}</li>
              ))}
            </ul>
          ) : (
            <p>No additional gaps identified in the supplied description.</p>
          )}
          <h3>Eligibility checks</h3>
          <ul>
            {findings.eligibility_checks.map((check) => (
              <li key={check.category}>
                <strong>
                  {check.category}: {check.status}
                </strong>
                <p>{check.explanation}</p>
                <small>Requirement: {check.requirement || "Not stated"}</small>
              </li>
            ))}
          </ul>
          {findings.eligibility_concerns.length > 0 && (
            <>
              <h4>Questions to confirm</h4>
              <ul>
                {findings.eligibility_concerns.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Why this score</h3>
          <p>{findings.score_explanation}</p>
          <p className="match-note">
            Skills {findings.skills_score}/100 (50%) · Experience{" "}
            {findings.experience_score}/100 (35%) · Role alignment{" "}
            {findings.context_score}/100 (15%). Eligibility is assessed
            separately.
          </p>
          <h3>Suggested resume emphasis</h3>
          {findings.suggested_resume_emphasis.length ? (
            <ul>
              {findings.suggested_resume_emphasis.map((item, index) => (
                <li key={index}>{item.finding}</li>
              ))}
            </ul>
          ) : (
            <p>Confirm the missing details before choosing an emphasis.</p>
          )}
          <h3>Recommended next action</h3>
          <p>{findings.recommended_next_action}</p>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => void analyze(true)}
          >
            Analyze Again
          </Button>
        </div>
      )}
    </section>
  );
}
