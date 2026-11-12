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
