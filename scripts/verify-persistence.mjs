// Opt-in LIVE Supabase check. Uses only a public project key and test-user JWTs.
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
for (const file of [".env.local", ".env.persistence-test.local"])
  if (existsSync(file)) process.loadEnvFile(file);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  token = process.env.INTERNOS_PERSISTENCE_TEST_TOKEN;
if (!url || !key || !token) {
  console.log(
    "SKIPPED: live persistence needs the project URL/public key and INTERNOS_PERSISTENCE_TEST_TOKEN for a signed-in test account. See README.",
  );
  process.exit(2);
}
let privilegedKey = key.startsWith("sb_secret_");
if (key.split(".").length === 3) {
  try {
    privilegedKey =
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role !== "anon";
  } catch {
    privilegedKey = true;
  }
}
if (privilegedKey) {
  console.log("FAILED: a public Supabase key is required.");
  process.exit(1);
}
const clientFor = (accessToken) =>
  createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
function checked(result) {
  if (result.error)
    throw new Error(
      `Supabase request failed (${result.error.code || "unknown"})`,
    );
  return result.data;
}
const client = clientFor(token);
let owner, record, job, company;
const id = randomUUID();
try {
  const verified = checked(await client.auth.getUser(token));
  if (!verified.user) throw new Error("Test identity could not be verified");
  owner = verified.user.id;
  const data = {
    id,
    company: `InternOS smoke ${id.slice(0, 8)}`,
    title: "Temporary persistence verification",
    location: "Remote",
    type: "Internship",
    source: "Manual persistence check",
    url: "",
    deadline: "",
    description: "Temporary synthetic job for persistence verification",
    status: "Saved",
    notes: "Synthetic verification note",
    important_date: "",
    applied_on: "",
    created_at: new Date().toISOString(),
    job_id: null,
    company_id: null,
    attempt: 1,
  };
  record = id;
  checked(
    await client.rpc("save_tracking_application", {
      p_data: data,
      p_create: true,
    }),
  );
  const fresh = clientFor(token);
  const persisted = checked(
    await fresh
      .from("applications")
      .select("id,job_id,company_id,notes,status")
      .eq("id", id)
      .eq("user_id", owner)
      .single(),
  );
  job = persisted.job_id;
  company = persisted.company_id;
  if (persisted.notes !== data.notes || !job || !company)
    throw new Error("Read-after-write verification failed");
  checked(
    await fresh
      .from("applications")
      .update({ status: "Interview", notes: "Synthetic edited note" })
      .eq("id", id)
      .eq("user_id", owner)
      .select("id")
      .single(),
  );
  const history = checked(
    await fresh
      .from("application_events")
      .select("from_status,to_status")
      .eq("application_id", id)
      .eq("user_id", owner),
  );
  if (
    !history.some(
      (event) =>
        event.from_status === "Saved" && event.to_status === "Interview",
    )
  )
    throw new Error("Status history verification failed");
  const duplicate = await fresh.rpc("save_tracking_application", {
    p_data: { ...data, id: randomUUID(), job_id: job, company_id: company },
    p_create: true,
  });
  if (duplicate.error?.code !== "23505")
    throw new Error("Duplicate prevention verification failed");
  const otherToken = process.env.INTERNOS_OTHER_USER_TEST_TOKEN;
  if (otherToken) {
    const other = clientFor(otherToken);
    const otherUser = checked(await other.auth.getUser(otherToken)).user;
    if (!otherUser || otherUser.id === owner)
      throw new Error("Isolation needs a second distinct test account");
    const visible = checked(
      await other.from("applications").select("id").eq("id", id),
    );
    if (visible.length) throw new Error("Cross-user read isolation failed");
    const changed = await other
      .from("applications")
      .update({ status: "Offer" })
      .eq("id", id)
      .select("id");
    if (!changed.error && changed.data?.length)
      throw new Error("Cross-user write isolation failed");
    console.log("PASS: live cross-user read/write isolation.");
  } else
    console.log(
      "SKIPPED: live cross-user check needs INTERNOS_OTHER_USER_TEST_TOKEN for a second test account.",
    );
  console.log(
    "PASS: live PostgreSQL create, fresh-client read, update, status history, and duplicate prevention.",
  );
} catch (error) {
  console.log(
    `FAILED: ${error instanceof Error ? error.message : "Live persistence verification failed"}`,
  );
  process.exitCode = 1;
} finally {
  if (record && owner) {
    // Recover IDs after a transient read failure, so synthetic records can still be removed.
    if (!job || !company) {
      const lookup = await client
        .from("applications")
        .select("job_id,company_id")
        .eq("id", record)
        .eq("user_id", owner)
        .maybeSingle();
      job = lookup.data?.job_id;
      company = lookup.data?.company_id;
    }
    const cleanup = [];
    cleanup.push(
      await client
        .from("applications")
        .delete()
        .eq("id", record)
        .eq("user_id", owner),
    );
    if (job) {
      cleanup.push(
        await client
          .from("user_jobs")
          .delete()
          .eq("user_id", owner)
          .eq("job_id", job),
      );
      cleanup.push(
        await client
          .from("jobs")
          .delete()
          .eq("id", job)
          .eq("created_by", owner),
      );
    }
    if (company)
      cleanup.push(
        await client
          .from("companies")
          .delete()
          .eq("id", company)
          .eq("created_by", owner),
      );
    if (cleanup.some((result) => result.error)) {
      console.log(
        "FAILED: temporary verification cleanup was incomplete. Inspect records with source Manual persistence check.",
      );
      process.exitCode = 1;
    } else console.log("PASS: temporary verification records deleted.");
  }
}
