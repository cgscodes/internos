import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationFlow } from "../src/lib/business/application-flow.ts";
import type { Activity, Application } from "../src/lib/models.ts";
const event = (
  id: string,
  from?: Application["status"] | null,
  to?: Application["status"] | null,
): Activity => ({
  id,
  application_id: "test",
  description: "Private event",
  created_at: "2026-11-12T00:00:00Z",
  from_status: from,
  to_status: to,
});
test("flow aggregates real transitions, repeated/backward moves, and event percentages", () => {
  const result = applicationFlow([
    event("1", "Saved", "Applied"),
    event("2", "Applied", "Interview"),
    event("3", "Interview", "Applied"),
    event("4", "Applied", "Interview"),
    event("4", "Applied", "Interview"),
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.rows.find((row) => row.from === "Applied")?.count, 2);
  assert.equal(result.rows.find((row) => row.from === "Applied")?.percent, 50);
  assert.equal(
    result.rows.find((row) => row.from === "Applied")?.outgoingPercent,
    100,
  );
});
test("flow never fabricates initial/legacy/current status history and handles empty accounts", () => {
  assert.deepEqual(applicationFlow([]), { total: 0, unavailable: 0, rows: [] });
  const result = applicationFlow([
    event("legacy"),
    event("creation", null, "Applied"),
    event("note", "Saved", "Saved"),
  ]);
  assert.equal(result.total, 0);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(result.rows, []);
});
