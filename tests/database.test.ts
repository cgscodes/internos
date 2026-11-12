import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";

test("migration, RLS isolation, composite ownership, and activity/version triggers", async () => {
  const db = await createTestDatabase();
  try {
    const alice = "00000000-0000-4000-8000-000000000001",
      bob = "00000000-0000-4000-8000-000000000002",
      app = "00000000-0000-4000-8000-000000000003",
      resume = "00000000-0000-4000-8000-000000000004";
    await db.query(
      `insert into auth.users(id,raw_user_meta_data) values ($1,'{"full_name":"Alice"}'),($2,'{"full_name":"Bob"}')`,
      [alice, bob],
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    await db.query(
      `insert into public.applications(id,user_id,company,title,notes) values($1,$2,'Test Co','Intern','Private note')`,
      [app, alice],
    );
    await db.query(
      `update public.applications set status='Interview' where id=$1`,
      [app],
    );
    assert.equal(
      (await db.query("select * from public.application_events")).rows.length,
      2,
    );
    await db.query(
      `insert into public.resumes(id,user_id,name,file_name,size,storage_path,is_master) values($1,$2,'Master','master.pdf',100,$3,true)`,
      [resume, alice, `${alice}/master.pdf`],
    );
    await db.query(
      `insert into public.resumes(user_id,name,file_name,size,storage_path,parent_id) values($1,'Version','version.pdf',100,$2,$3)`,
      [alice, `${alice}/version.pdf`, resume],
    );
    assert.equal(
      (await db.query("select * from public.resume_versions")).rows.length,
      1,
    );
    await db.query(
      `insert into storage.objects(bucket_id,name) values('resumes',$1)`,
      [`${alice}/master.pdf`],
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    for (const table of [
      "applications",
      "application_events",
      "resumes",
      "resume_versions",
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
        `${table} must be private`,
      );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(() =>
      db.query(
        `insert into public.applications(user_id,company,title) values($1,'Impersonation','Intern')`,
        [alice],
      ),
    );
    await assert.rejects(() =>
      db.query(
        `insert into public.applications(user_id,company,title,resume_id) values($1,'Cross owner','Intern',$2)`,
        [bob, resume],
      ),
    );
    await assert.rejects(() =>
      db.query(
        `insert into public.interviews(user_id,application_id,scheduled_at) values($1,$2,now())`,
        [bob, app],
      ),
    );
    await assert.rejects(() =>
      db.query(
        `insert into storage.objects(bucket_id,name) values('resumes',$1)`,
        [`${alice}/intrusion.pdf`],
      ),
    );
    await db.query(
      `update public.applications set notes='intrusion' where id=$1`,
      [app],
    );
    await db.query(`delete from public.applications where id=$1`, [app]);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    const own = await db.query<{ notes: string }>(
      `select notes from public.applications where id=$1`,
      [app],
    );
    assert.equal(own.rows[0].notes, "Private note");
    await db.query(`delete from public.applications where id=$1`, [app]);
    assert.equal(
      (await db.query("select * from public.application_events")).rows.length,
      0,
    );
    const bucket = await db.query<{ public: boolean }>(
      "select public from storage.buckets",
    );
    assert.equal(bucket.rows[0].public, false);
  } finally {
    await db.close();
  }
});
