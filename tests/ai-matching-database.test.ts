import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";

test("AI migration enforces ownership, composite resume references, saved jobs, durable rate limits, and per-user leases", async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
    const shared = crypto.randomUUID(),
      privateJob = crypto.randomUUID(),
      aliceResume = crypto.randomUUID(),
      bobResume = crypto.randomUUID();
    await db.query(
      "insert into public.jobs(id,company,title,description,created_by) values($1,'Shared','Engineer','Detailed responsibilities',null),($2,'Private','Engineer','Private responsibilities',$3)",
      [shared, privateJob, alice],
    );
    await db.query(
      "insert into public.resumes(id,user_id,name,file_name,size,storage_path) values($1,$2,'Alice resume','resume.pdf',100,$3),($4,$5,'Bob resume','resume.pdf',100,$6)",
      [
        aliceResume,
        alice,
        `${alice}/${aliceResume}.pdf`,
        bobResume,
        bob,
        `${bob}/${bobResume}.pdf`,
      ],
    );
    await db.query(
      "insert into public.user_jobs(user_id,job_id) values($1,$2),($3,$2),($1,$4)",
      [alice, shared, bob, privateJob],
    );
    const as = async (user: string) =>
      db.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
      );
    const begin = async (job = shared, resume = aliceResume) =>
      (
        await db.query<{ lease: string }>(
          "select public.begin_job_match($1,$2) as lease",
          [job, resume],
        )
      ).rows[0].lease;
    const end = (lease: string) =>
      db.query("select public.end_job_match($1)", [lease]);
    await as(alice);
    const lease = await begin();
    await assert.rejects(() => begin(), /already running/);
    await end(crypto.randomUUID());
    await assert.rejects(() => begin(), /already running/); // Cannot release another request's lease.
    await end(lease);
    const insert = async (
      owner: string,
      job: string,
      resume: string,
      hash = "a".repeat(64),
    ) =>
      db.query(
        `insert into public.job_match_analyses(user_id,job_id,resume_id,model,prompt_version,input_hash,job_hash,resume_hash,match_score,findings) values($1,$2,$3,'mock-model','test',$4,$4,$4,78,'{}') returning id`,
        [owner, job, resume, hash],
      );
    const analysisId = (await insert(alice, shared, aliceResume)).rows[0];
    assert.ok(analysisId);
    await assert.rejects(
      () => insert(alice, shared, bobResume, "b".repeat(64)),
      /foreign key/,
    );
    await assert.rejects(
      () => insert(bob, shared, bobResume, "c".repeat(64)),
      /row-level security/,
    );
    await assert.rejects(() => begin(shared, bobResume), /not found/);
    await assert.rejects(
      () => db.exec("delete from public.ai_match_limits"),
      /permission denied/,
    );
    await as(bob);
    assert.equal(
      (await db.query("select * from public.job_match_analyses")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update public.job_match_analyses set match_score=100 returning id",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(() => begin(privateJob, bobResume), /not found/);
    await assert.rejects(
      () => insert(bob, privateJob, bobResume),
      /row-level security/,
    );
    await end(await begin(shared, bobResume)); // Other users' leases/quotas are independent.
    await as(alice);
    for (let i = 1; i < 10; i++) await end(await begin());
    await db.exec("delete from public.job_match_analyses");
    await assert.rejects(() => begin(), /request limit/); // Deleting cached data never resets quota.
    await db.exec(
      "reset role; update public.ai_match_limits set window_start=now()-interval '11 minutes'",
    );
    await as(alice);
    await end(await begin());
    await db.exec(
      "reset role; update public.ai_match_limits set lease_id=gen_random_uuid(),lease_until=now()-interval '1 second'",
    );
    await as(alice);
    await end(await begin()); // Crashed processes recover after their lease expires.
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(() => begin(), /Unauthorized/);
  } finally {
    await db.close();
  }
});
