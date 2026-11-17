import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfLayout } from "../src/lib/pdf/extract.ts";
import {
  parseTracker,
  mapHandshakeStatus,
  parseAppliedDate,
  rowValidation,
  matchingApplication,
  extractedPdfRowSchema,
  importDraftSchema,
  finalizedImportRowSchema,
  importFieldsSchema,
  normalizeExtractedRow,
  importValidationMessages,
} from "../src/lib/pdf/tracker.ts";
import {
  currentApplicationFlow,
  applicationFlow,
} from "../src/lib/business/application-flow.ts";
import { applicationSchema, type Activity } from "../src/lib/models.ts";
import { trackerPdf } from "./helpers/job-pdf.mjs";
import { createTestDatabase } from "./helpers/database.mjs";
const hash = "a".repeat(64);
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
async function extracted() {
  return parseTracker(
    (await extractPdfLayout(new Uint8Array(trackerPdf()), undefined, true))
      .pages,
    hash,
  );
}
test("positioned multipage PDF parses all applications, skips repeated headers/navigation/footer, and flags truncated/missing/unknown values", async () => {
  const rows = await extracted();
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.company),
    ["Example Studio", "Truncated...", "Another Studio", "Reviewed Studio"],
  );
  assert.equal(rows[0].applied_on, "2026-11-10");
  assert.equal(rows[1].title, "Software Intern...");
  assert.equal(rows[1].location, "New York...");
  assert.equal(rows[1].applied_on, "");
  assert.equal(
    rows[1].warnings.filter((w) => w.includes("truncated")).length,
    3,
  );
  assert.equal(rows[1].status, "");
  assert.equal(rows[2].status, "Interview");
  assert.equal(rows[3].status, "");
  assert.deepEqual(
    rows.map((r) => r.import_key),
    [`${hash}:1:1`, `${hash}:1:2`, `${hash}:2:1`, `${hash}:2:2`],
  );
  assert.equal((await extracted())[0].import_key, rows[0].import_key);
  assert.ok(!rowValidation(rows[1]).success);
  assert.ok(
    rowValidation({
      ...rows[1],
      company: "Corrected Studio",
      title: "Known title",
      applied_on: "2026-10-01",
      status: "Applied",
      type: "Internship",
      reviewed: true,
    }).success,
  );
});
test("dates and status mappings never infer dates, rejection from closed or interviews from reviewed", () => {
  for (const status of [
    "Reviewed",
    "Declined",
    "Closed",
    "Inactive",
    "Unavailable",
    "Mystery",
  ])
    assert.equal(mapHandshakeStatus(status), "");
  assert.equal(mapHandshakeStatus("Hired"), "Offer");
  for (const date of ["Nov 10", "2026-02-30", "Feb 30, 2026", "yesterday"])
    assert.equal(parseAppliedDate(date), "");
});
test("import RPC creates ordinary applications/history atomically, reimports are idempotent after terminal status, and row failures are isolated", async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
    await db.exec(
      "alter table public.applications add constraint import_rollback_test check(company <> 'Rollback Studio') not valid",
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    const rows = await extracted();
    const corrected = finalizedImportRowSchema.parse({
      ...rows[0],
      applied_on: "11/10/26",
      reviewed: true,
      type: "Internship",
    });
    const save = async (row: unknown) =>
      (
        await db.query<{ result: { id: string; outcome: string } }>(
          "select public.import_tracking_application($1::jsonb) as result",
          [JSON.stringify(row)],
        )
      ).rows[0].result;
    const result = await save(corrected);
    assert.equal(result.outcome, "created");
    const app = (
      await db.query<{
        source: string;
        source_status: string;
        applied_on: string;
        job_id: string;
        company_id: string;
      }>("select *,applied_on::text from public.applications")
    ).rows[0];
    assert.equal(app.source, "Handshake");
    assert.equal(app.source_status, "Applied");
    assert.equal(app.applied_on, "2026-11-10");
    assert.ok(app.job_id && app.company_id);
    assert.equal(
      (await db.query("select * from public.application_events")).rows.length,
      1,
    );
    assert.equal((await save(corrected)).outcome, "duplicate");
    // A different export of the same semantic row also matches a manual/imported application.
    assert.equal(
      (await save({ ...corrected, import_key: `${"b".repeat(64)}:1:1` }))
        .outcome,
      "duplicate",
    );
    await db.query(
      "update public.applications set status='Rejected',notes='User edit' where id=$1",
      [result.id],
    );
    assert.equal((await save(corrected)).outcome, "duplicate");
    assert.equal(
      (await save({ ...corrected, import_key: `${"c".repeat(64)}:1:1` }))
        .outcome,
      "duplicate",
    );
    // The failed row follows a successful row; its company and job must roll back together.
    await assert.rejects(() =>
      save({
        ...corrected,
        import_key: `${hash}:9:9`,
        company: "Rollback Studio",
        title: "Bad row",
        applied_on: "2026-02-30",
      }),
    );
    await assert.rejects(
      () =>
        save({
          ...corrected,
          import_key: `${hash}:9:8`,
          company: "Rollback Studio",
          job_id: crypto.randomUUID(),
        }),
      /Job not found/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.companies where name='Rollback Studio'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        save({
          ...corrected,
          import_key: `${hash}:9:7`,
          company: "Rollback Studio",
          title: "Fails after creating job",
        }),
      /import_rollback_test/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.companies where name='Rollback Studio'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.jobs where company='Rollback Studio'",
        )
      ).rows.length,
      0,
    );
    const next = await save({ ...rows[2], type: "Internship", reviewed: true });
    assert.equal(next.outcome, "created");
    const events = (
      await db.query<Activity>("select * from public.application_events")
    ).rows;
    assert.equal(applicationFlow(events).total, 1); // only the explicit Applied → Rejected
    assert.equal(
      (await db.query("select * from public.applications")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from public.application_import_receipts")).rows
        .length,
      4,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    for (const table of [
      "applications",
      "jobs",
      "companies",
      "application_events",
      "application_import_receipts",
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
      );
    await assert.rejects(
      () => save({ ...corrected, job_id: app.job_id }),
      /Job not found/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.application_import_receipts values($1,$2,$3)",
          [bob, `${hash}:9:1`, result.id],
        ),
      /row-level security/,
    );
    assert.equal((await save(corrected)).outcome, "created"); // same PDF, independent user
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(() => save(corrected), /Unauthorized/);
  } finally {
    await db.close();
  }
});
test("current Sankey conserves unique application counts, respects No Reply threshold, and never mutates history/status", () => {
  const make = (status: string, date: string) =>
    applicationSchema.parse({
      id: crypto.randomUUID(),
      company: "Test",
      title: "Intern",
      location: "",
      type: "Internship",
      source: "Handshake",
      url: "",
      deadline: "",
      status,
      notes: "",
      important_date: "",
      applied_on: date,
      created_at: new Date().toISOString(),
    });
  const apps = [
    make("Applied", "2026-10-01"),
    make("Applied", "2026-11-10"),
    make("Offer", "2026-11-01"),
    make("Rejected", "2026-10-01"),
  ];
  const flow = currentApplicationFlow([...apps, apps[0]], 30, "2026-11-16");
  assert.equal(flow.total, 4);
  assert.equal(
    flow.rows.reduce((sum, r) => sum + r.count, 0),
    4,
  );
  assert.equal(
    flow.rows.reduce((sum, r) => sum + r.percent, 0),
    100,
  );
  assert.equal(flow.rows.find((r) => r.status === "No Reply")?.count, 1);
  assert.equal(
    currentApplicationFlow(apps, 90, "2026-11-16").rows.some(
      (r) => r.status === "No Reply",
    ),
    false,
  );
  assert.equal(apps[0].status, "Applied");
  assert.equal(applicationFlow([]).total, 0);
  assert.equal(
    matchingApplication({ ...apps[1], job_id: null }, apps)?.id,
    apps[0].id,
  );
  assert.equal(currentApplicationFlow([]).total, 0);
});

test("wrapped company/title cells stay in one row and inactive listing labels never become applications", async () => {
  const layout = await extractPdfLayout(
    new Uint8Array(trackerPdf()),
    undefined,
    true,
  );
  const page = layout.pages[0];
  const company = page.items.find((item) => item.text === "Example Studio")!;
  const title = page.items.find((item) => item.text === "Engineering Intern")!;
  page.items.push(
    { ...company, text: "Division", y: company.y + 14 },
    { ...title, text: "Platform team", y: title.y + 14 },
    { ...title, text: "Inactive listing", y: title.y + 28 },
  );
  const rows = parseTracker(layout.pages, hash);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].company, "Example Studio Division");
  assert.equal(rows[0].title, "Engineering Intern Platform team");
  assert.equal(rows[0].status, "Applied");
  assert.ok(rows[0].warnings.some((w) => w.includes("inactive")));
});

test("inactive source statuses are preserved verbatim for manual mapping", async () => {
  const pdf = trackerPdf([
    [["Status Studio", "Intern", "2026-11-01", "Remote", "Inactive"]],
  ]);
  const rows = parseTracker(
    (await extractPdfLayout(new Uint8Array(pdf), undefined, true)).pages,
    hash,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_status, "Inactive");
  assert.equal(rows[0].status, "");
});

test("two-digit Handshake dates normalize to ISO without accepting impossible dates or inventing missing ones", async () => {
  for (const [source, iso] of [
    ["11/10/26", "2026-11-10"],
    ["2/29/24", "2024-02-29"],
    ["01/01/00", "2000-01-01"],
    ["11/10/2026", "2026-11-10"],
  ])
    assert.equal(parseAppliedDate(source), iso);
  for (const source of [
    "",
    "2/29/26",
    "2/30/24",
    "13/01/26",
    "11/00/26",
    "11/10",
    "11/10/026",
  ])
    assert.equal(parseAppliedDate(source), "");
  const rows = parseTracker(
    (
      await extractPdfLayout(
        new Uint8Array(
          trackerPdf([
            [["Date Studio", "Intern", "11/10/26", "Remote", "aPpLiEd"]],
          ]),
        ),
        undefined,
        true,
      )
    ).pages,
    hash,
  );
  assert.equal(rows[0].applied_on, "2026-11-10");
  assert.equal(rows[0].source_applied_on, "11/10/26");
  assert.equal(rows[0].status, "Applied");
  assert.equal(rows[0].source_status, "aPpLiEd");
});

test("extracted rows and editable drafts allow uncertainty, while final records require explicit type, status, date and boolean review", async () => {
  assert.ok(extractedPdfRowSchema.safeParse({}).success);
  const row = (await extracted())[0];
  const draft = importDraftSchema.parse({
    ...row,
    ...normalizeExtractedRow({
      company: "Test",
      title: "Role",
      source_status: "Reviewed",
    }),
  });
  assert.equal(draft.applied_on, "");
  assert.equal(draft.type, "");
  assert.equal(draft.status, "");
  assert.equal(draft.reviewed, false);
  assert.ok(importDraftSchema.safeParse(draft).success);
  const invalid = finalizedImportRowSchema.safeParse(draft);
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.deepEqual(
      invalid.error.issues.map((issue) => issue.path[0]),
      ["applied_on", "status", "type", "reviewed"],
    );
    assert.ok(
      importValidationMessages(invalid.error.issues, 12).every((message) =>
        message.startsWith("Row 12: "),
      ),
    );
    assert.ok(
      importValidationMessages(invalid.error.issues, 12).some((message) =>
        message.includes("Job type needs confirmation"),
      ),
    );
  }
  const fields = {
    ...draft,
    applied_on: "11/10/26",
    status: "Applied",
    type: "Co-op",
  };
  assert.ok(importFieldsSchema.safeParse(fields).success); // valid fields do not require premature confirmation
  for (const reviewed of [false, "true", "false", 1, undefined])
    assert.equal(
      finalizedImportRowSchema.safeParse({ ...fields, reviewed }).success,
      false,
    );
  assert.equal(
    importDraftSchema.safeParse({ ...draft, reviewed: "true" }).success,
    false,
  );
  const final = finalizedImportRowSchema.parse({ ...fields, reviewed: true });
  assert.equal(final.reviewed, true);
  assert.equal(final.applied_on, "2026-11-10");
  assert.equal(final.type, "Co-op");
  assert.equal(
    finalizedImportRowSchema.safeParse({ ...final, status: "applied" }).success,
    false,
  );
  for (const status of [
    "Saved",
    "Preparing",
    "Ready",
    "Applied",
    "Assessment",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
  ])
    assert.equal(mapHandshakeStatus(` ${status.toUpperCase()} `), status);
  for (const status of [
    "Unknown",
    "Reviewed",
    "Declined",
    "Closed",
    "constructor",
    "__proto__",
  ])
    assert.equal(mapHandshakeStatus(status), "");
  assert.equal(normalizeExtractedRow({ type: "co-op" }).type, "Co-op");
  assert.equal(normalizeExtractedRow({ type: "Full-time" }).type, "");
});
