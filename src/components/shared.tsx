import {
  MapPin,
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
} from "lucide-react";
import { Job } from "@/lib/models";
import { Button } from "./ui/button";
export function CompanyMark({ name }: { name: string }) {
  const marks: Record<string, string> = {
    Linear: "◩",
    Notion: "N",
    Stripe: "S",
    Figma: "f",
    Spotify: "≋",
    Vercel: "▲",
    Airbnb: "A",
    Ramp: "r",
  };
  return (
    <span
      className={`company-mark company-${name.toLowerCase().replace(/[^a-z]/g, "")}`}
    >
      {marks[name] || name.slice(0, 1)}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <BriefcaseBusiness size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function JobCard({
  job,
  saved,
  onSave,
  onDetails,
  busy = false,
}: {
  job: Job;
  saved: boolean;
  onSave: () => void;
  onDetails: () => void;
  busy?: boolean;
}) {
  return (
    <article className="job-card">
      <div className="row between">
        <div className="row">
          <CompanyMark name={job.company} />
          <div>
            <strong>{job.company}</strong>
            <small>{job.source}</small>
          </div>
        </div>
        <button
          className={`icon-button ${saved ? "is-saved" : ""}`}
          onClick={onSave}
          disabled={busy}
          aria-label={
            saved ? "Remove bookmark" : `Save ${job.title} at ${job.company}`
          }
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button onClick={onDetails} className="job-title">
        {job.title}
      </button>
      <p className="job-location">
        <MapPin size={14} />
        {job.location || "Location not provided"}
      </p>
      <div className="job-tags">
        <span>{job.type}</span>
        <span>Match score · Not connected</span>
      </div>
      <div className="job-card-footer">
        <span>
          Apply by {job.deadline ? dateLabel(job.deadline) : "Not specified"}
        </span>
        <Button
          variant="ghost"
          onClick={onDetails}
          aria-label={`View ${job.title} at ${job.company}`}
        >
          <ArrowUpRight size={18} />
        </Button>
      </div>
    </article>
  );
}
export function dateLabel(value: string) {
  return new Date(
    value.length === 10 ? value + "T12:00:00" : value,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
