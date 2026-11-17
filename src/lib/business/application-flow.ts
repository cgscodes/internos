import { statuses, type Activity } from "../models.ts";
/** Bipartite before/after graph: backward moves/repeated pairs cannot form cycles. */
export function applicationFlow(events: Activity[]) {
  const pairs = new Map<string, { from: string; to: string; count: number }>();
  const ids = new Set<string>();
  let unavailable = 0;
  for (const event of events) {
    if (ids.has(event.id)) continue;
    ids.add(event.id);
    const from = event.from_status,
      to = event.to_status;
    if (
      !from ||
      !to ||
      !statuses.includes(from) ||
      !statuses.includes(to) ||
      from === to
    ) {
      if (!from && !to) unavailable++;
      continue;
    }
    const key = `${from}:${to}`;
    const pair = pairs.get(key) || { from, to, count: 0 };
    pair.count++;
    pairs.set(key, pair);
  }
  const rows = [...pairs.values()].sort(
    (a, b) =>
      statuses.indexOf(a.from as (typeof statuses)[number]) -
        statuses.indexOf(b.from as (typeof statuses)[number]) ||
      statuses.indexOf(a.to as (typeof statuses)[number]) -
        statuses.indexOf(b.to as (typeof statuses)[number]),
  );
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    unavailable,
    rows: rows.map((row) => ({
      ...row,
      percent: (row.count / total) * 100,
      outgoingPercent:
        (row.count /
          rows
            .filter((other) => other.from === row.from)
            .reduce((sum, other) => sum + other.count, 0)) *
        100,
    })),
  };
}

/** One path per application. No Reply is a display classification, never a stored status. */
export function currentApplicationFlow(
  applications: import("../models.ts").Application[],
  noReplyDays = 30,
  today = new Date().toISOString().slice(0, 10),
) {
  const unique = [...new Map(applications.map((a) => [a.id, a])).values()];
  const counts = new Map<string, number>();
  for (const app of unique) {
    const days = app.applied_on
      ? (Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${app.applied_on}T00:00:00Z`)) /
        86400000
      : -1;
    const status =
      app.status === "Applied" && days >= Math.max(1, noReplyDays)
        ? "No Reply"
        : app.status;
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const outcome = (status: string) =>
    status === "Offer"
      ? "Offers"
      : ["Rejected", "Withdrawn"].includes(status)
        ? "Ended"
        : status === "No Reply"
          ? "Awaiting response"
          : ["Saved", "Preparing", "Ready"].includes(status)
            ? "Preparation"
            : "In progress";
  return {
    total: unique.length,
    rows: [...counts].map(([status, count]) => ({
      status,
      count,
      outcome: outcome(status),
      percent: unique.length ? (count / unique.length) * 100 : 0,
    })),
  };
}
