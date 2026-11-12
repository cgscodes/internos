import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationSchema } from "../src/lib/models.ts";
import { dashboardSummary } from "../src/lib/business/tracking.ts";
import { mutationSchema } from "../src/lib/validation/tracking.ts";
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  company: "Test",
  title: "Intern",
  location: "Remote",
  type: "Internship",
  source: "Manual",
  url: "",
  deadline: "2026-12-01",
  status: "Saved",
  notes: "",
  important_date: "",
  created_at: "2026-11-12T12:00:00Z",
};
test("dashboard counts exclude all preparation stages from submitted and handle empty accounts", () => {
  assert.deepEqual(dashboardSummary([], "2026-11-12"), {
    total: 0,
    submitted: 0,
    interviews: 0,
    offers: 0,
    upcoming: [],
  });
  const statuses = [
    "Saved",
    "Preparing",
    "Ready",
    "Applied",
    "Assessment",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
  ];
  const rows = statuses.map((status) =>
    applicationSchema.parse({ ...base, status }),
  );
  const summary = dashboardSummary(rows, "2026-11-12");
  assert.equal(summary.total, 9);
  assert.equal(summary.submitted, 6);
  assert.equal(summary.interviews, 1);
  assert.equal(summary.offers, 1);
  assert.equal(summary.upcoming.length, 6);
  assert.equal(dashboardSummary(rows, "2027-01-01").upcoming.length, 0);
});
test("mutations reject forged user ids, invalid applied dates, and unsupported actions", () => {
  for (const mutation of [
    { action: "delete", id: base.id, user_id: "forged" },
    { action: "status", id: base.id, status: "Unknown" },
    {
      action: "application.create",
      data: { ...base, applied_on: "2026-02-30" },
    },
    { action: "job.create", data: { ...base, description: "x".repeat(20001) } },
    { action: "application", data: base },
  ])
    assert.equal(mutationSchema.safeParse(mutation).success, false);
});
