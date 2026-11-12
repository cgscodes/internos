import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";
import { applicationSchema } from "../src/lib/models.ts";
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
function draft(overrides: Record<string, unknown> = {}) {
  return applicationSchema.parse({
    id: crypto.randomUUID(),
    company: "Example Studio",
    title: "Engineering Intern",
    location: "Remote",
    type: "Internship",
    source: "Manual entry",
    url: "https://example.test/job",
    deadline: "2026-12-01",
    status: "Saved",
    notes: "Private preparation notes",
    important_date: "",
    created_at: new Date().toISOString(),
    ...overrides,
  });
}
test("atomic CRUD, history, bookmarks, private jobs, duplicates, reapplications, and RLS", async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    const app = draft();
    const save = (data: ReturnType<typeof draft>, create: boolean) =>
      db.query("select public.save_tracking_application($1::jsonb,$2)", [
        JSON.stringify(data),
        create,
      ]);
    await save(app, true);
    const row = (
      await db.query<{
        id: string;
        job_id: string;
        company_id: string;
        attempt: number;
        applied_on: string | null;
      }>("select * from public.applications")
    ).rows[0];
    assert.equal(row.id, app.id);
    assert.ok(row.job_id);
    assert.ok(row.company_id);
    assert.equal(row.attempt, 1);
    assert.equal(row.applied_on, null);
    assert.equal(
      (await db.query("select * from public.user_jobs")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from public.jobs")).rows.length, 1);
    await assert.rejects(
      () => save(draft(), true),
      /active application already exists/,
    );
    assert.equal(
      (await db.query("select * from public.companies")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from public.jobs")).rows.length, 1);
    await save(
      {
        ...app,
        job_id: row.job_id,
        company_id: row.company_id,
        description: "Real role details",
        notes: "Edited notes",
        status: "Applied",
        applied_on: "2026-11-10",
      },
      false,
    );
    const changed = (
      await db.query<{
        notes: string;
        applied_on: string;
        description: string;
      }>(
        "select notes,description,applied_on::text as applied_on from public.applications",
      )
    ).rows[0];
    assert.equal(changed.notes, "Edited notes");
    assert.equal(changed.applied_on, "2026-11-10");
    assert.equal(changed.description, "Real role details");
    const events = (
      await db.query<{
        from_status: string | null;
        to_status: string;
        description: string;
      }>("select * from public.application_events order by created_at")
    ).rows;
    assert.equal(events.length, 2);
    assert.equal(events[1].from_status, "Saved");
    assert.equal(events[1].to_status, "Applied");
    assert.ok(
      events.every((event) => !event.description.includes("Edited notes")),
    );
    await db.query(
      "update public.applications set status='Rejected' where id=$1",
      [app.id],
    );
    const retry = draft({ job_id: row.job_id });
    await save(retry, true);
    assert.equal(
      (
        await db.query<{ attempt: number }>(
          "select attempt from public.applications where id=$1",
          [retry.id],
        )
      ).rows[0].attempt,
      2,
    );
    await assert.rejects(
      () =>
        db.query(
          "update public.applications set status='Applied' where id=$1",
          [app.id],
        ),
      /unique constraint/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    for (const table of [
      "applications",
      "application_events",
      "jobs",
      "companies",
      "user_jobs",
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
        table,
      );
    await assert.rejects(
      () => save({ ...app, job_id: row.job_id }, false),
      /not found/,
    );
    await assert.rejects(
      () => save(draft({ job_id: row.job_id }), true),
      /Job not found/,
    );
    await assert.rejects(
      () =>
        db.query("insert into public.user_jobs(user_id,job_id) values($1,$2)", [
          bob,
          row.job_id,
        ]),
      /not accessible/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.applications(user_id,company,title,job_id) values($1,$2,$3,$4)",
          [bob, "Cross owner", "Intern", row.job_id],
        ),
      /not accessible/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.jobs(created_by,company_id,company,title) values($1,$2,$3,$4)",
          [bob, row.company_id, "Cross owner", "Intern"],
        ),
      /not accessible/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.applications(user_id,company,title) values($1,$2,$3)",
          [alice, "Forged", "Intern"],
        ),
      /row-level security/,
    );
    await db.query("delete from public.applications where id=$1", [app.id]);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    assert.equal(
      (await db.query("select * from public.applications")).rows.length,
      2,
    );
    await db.query("delete from public.applications where id=$1", [app.id]);
    assert.equal(
      (
        await db.query(
          "select * from public.application_events where application_id=$1",
          [app.id],
        )
      ).rows.length,
      0,
    );
    // A late application constraint failure rolls back the newly-created company/job too.
    await assert.rejects(() =>
      save(
        {
          ...draft({ company: "Rolled Back Company", title: "Rollback Job" }),
          notes: "x".repeat(10001),
        },
        true,
      ),
    );
    assert.equal(
      (
        await db.query(
          "select * from public.companies where name='Rolled Back Company'",
        )
      ).rows.length,
      0,
    );
    await db.query(
      "insert into public.applications(user_id,company,title,location,url) values($1,'Legacy Studio','Intern','Remote','https://example.test/job')",
      [alice],
    );
    await assert.rejects(
      () => save(draft({ company: "Legacy Studio", title: "Intern" }), true),
      /legacy application already exists/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.companies where name='Legacy Studio'",
        )
      ).rows.length,
      0,
    );
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(() => save(draft(), true), /Unauthorized/);
  } finally {
    await db.close();
  }
});
test("shared catalog remains read-only and can be bookmarked/applied to independently", async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
    const company = crypto.randomUUID(),
      job = crypto.randomUUID();
    await db.query(
      "insert into public.companies(id,name) values($1,'Shared Studio')",
      [company],
    );
    await db.query(
      "insert into public.jobs(id,company_id,company,title) values($1,$2,'Shared Studio','Intern')",
      [job, company],
    );
    for (const user of [alice, bob]) {
      await db.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
      );
      assert.equal(
        (await db.query("select * from public.jobs")).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "update public.jobs set title='Tampered' where id=$1 returning id",
            [job],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "delete from public.companies where id=$1 returning id",
            [company],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        () =>
          db.query(
            "insert into public.jobs(company,title) values('Invented shared','Intern')",
          ),
        /row-level security/,
      );
      const app = draft({
        company: "Shared Studio",
        company_id: company,
        job_id: job,
        title: "Intern",
        status: "Interview",
        notes: "Own notes",
      });
      await db.query(
        "select public.save_tracking_application($1::jsonb,true)",
        [JSON.stringify(app)],
      );
      assert.equal(
        (await db.query("select * from public.applications")).rows.length,
        1,
      );
      assert.equal(
        (await db.query("select * from public.user_jobs")).rows.length,
        1,
      );
      assert.ok(
        (
          await db.query<{ applied_on: string }>(
            "select applied_on from public.applications",
          )
        ).rows[0].applied_on,
      );
    }
  } finally {
    await db.close();
  }
});
