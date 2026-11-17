// Opt-in LIVE Supabase check. Uses only a public project key and test-user JWTs.
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
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
let owner, record, job, company, imported;
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
  const importData = {
    ...data,
    company: `InternOS bulk smoke ${id.slice(0, 8)}`,
    title: "Temporary bulk import verification",
    import_key: `${createHash("sha256").update(id).digest("hex")}:1:1`,
    status: "Applied",
    source_status: "Applied",
    applied_on: new Date().toISOString().slice(0, 10),
    reviewed: true,
  };
  const created = checked(
    await fresh.rpc("import_tracking_application", { p_data: importData }),
  );
  if (created.outcome !== "created")
    throw new Error("Bulk import did not create a new record");
  imported = { id: created.id };
  const importedRow = checked(
    await clientFor(token)
      .from("applications")
      .select("id,job_id,company_id,source,source_status,applied_on,status")
      .eq("id", imported.id)
      .single(),
  );
  Object.assign(imported, importedRow);
  if (
    importedRow.source !== "Handshake" ||
    importedRow.applied_on !== importData.applied_on ||
    importedRow.status !== "Applied" ||
    importedRow.source_status !== "Applied"
  )
    throw new Error("Imported fields were not preserved");
  const repeated = checked(
    await fresh.rpc("import_tracking_application", { p_data: importData }),
  );
  if (repeated.outcome !== "duplicate" || repeated.id !== imported.id)
    throw new Error("Bulk reimport was not idempotent");
  const importedHistory = checked(
    await fresh
      .from("application_events")
      .select("from_status,to_status")
      .eq("application_id", imported.id),
  );
  if (
    importedHistory.length !== 1 ||
    importedHistory[0].from_status !== null ||
    importedHistory[0].to_status !== "Applied"
  )
    throw new Error("Bulk import invented history");
  console.log(
    "PASS: live bulk import, preserved source/date/status, initial event, and idempotent reimport.",
  );
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
    const importedVisible = checked(
      await other.from("applications").select("id").eq("id", imported.id),
    );
    const receiptsVisible = checked(
      await other
        .from("application_import_receipts")
        .select("import_key")
        .eq("application_id", imported.id),
    );
    if (importedVisible.length || receiptsVisible.length)
      throw new Error("Bulk import cross-user isolation failed");
    console.log(
      "PASS: live cross-user read/write isolation, including imported rows and receipts.",
    );
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
  if (imported && owner) {
    const lookup = await client
      .from("applications")
      .select("job_id,company_id")
      .eq("id", imported.id)
      .eq("user_id", owner)
      .maybeSingle();
    const cleanup = [];
    cleanup.push(
      await client
        .from("applications")
        .delete()
        .eq("id", imported.id)
        .eq("user_id", owner),
    );
    if (lookup.data?.job_id) {
      cleanup.push(
        await client
          .from("user_jobs")
          .delete()
          .eq("job_id", lookup.data.job_id)
          .eq("user_id", owner),
      );
      cleanup.push(
        await client
          .from("jobs")
          .delete()
          .eq("id", lookup.data.job_id)
          .eq("created_by", owner),
      );
    }
    if (lookup.data?.company_id)
      cleanup.push(
        await client
          .from("companies")
          .delete()
          .eq("id", lookup.data.company_id)
          .eq("created_by", owner),
      );
    if (cleanup.some((result) => result.error)) {
      console.log(
        "FAILED: temporary bulk verification cleanup incomplete; inspect InternOS bulk smoke records.",
      );
      process.exitCode = 1;
    }
  }
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
