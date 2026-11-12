import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className="metric-card">
      <div className="row between">
        <span>{label}</span>
        <span className={cn("metric-icon", tone)}>
          <Icon size={18} />
        </span>
      </div>
      <div className="metric-value">{String(value).padStart(2, "0")}</div>
      <p>
        <span className={cn("metric-indicator", tone)} />
        {detail}
      </p>
    </article>
  );
}
