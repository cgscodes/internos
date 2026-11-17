import { test, expect } from "./fixtures";
import { jobLines, jobPdf, tenMegabyteJobPdf } from "../helpers/job-pdf.mjs";

test("PDF review preserves text, saves a job once, and starts a Saved application", async ({
  page,
}) => {
  await page.goto("/discover");
  for (const application of [false, true]) {
    await page.getByRole("button", { name: "Import PDF", exact: true }).click();
    await page.getByLabel("Job description PDF").setInputFiles({
      name: "handshake-export.pdf",
      mimeType: "application/pdf",
      buffer: application ? jobPdf(jobLines) : tenMegabyteJobPdf(),
    });
    const dialog = page.getByRole("dialog", { name: "Review imported job" });
    await expect(dialog.getByRole("textbox", { name: /^Company/ })).toHaveValue(
      "Import Test Studio",
    );
    await expect(
      dialog.getByRole("textbox", { name: "Full job description" }),
    ).toContainText("Build thoughtful software");
    await dialog.getByRole("textbox", { name: /^Salary/ }).fill("$30 per hour");
    await dialog
      .getByRole("button", {
        name: application ? "Save & start application" : "Save job",
        exact: true,
      })
      .click();
    await expect(dialog).toHaveCount(0);
    if (application) {
      await expect(
        page.getByRole("combobox", { name: "Status", exact: true }),
      ).toHaveValue("Saved");
      await page
        .getByRole("button", { name: "Save application", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }
  const workspace = await (await page.request.get("/api/workspace")).json();
  const imported = workspace.jobs.filter(
    (job: { company: string }) => job.company === "Import Test Studio",
  );
  expect(imported).toHaveLength(1);
  expect(imported[0].description).toContain("Salary (reviewed): $30 per hour");
  expect(imported[0].description).toContain("Salary: $25 per hour");
  expect(imported[0].description).toContain("Build thoughtful software");
  expect(workspace.applications[0].status).toBe("Saved");
  const changed = await page.request.post("/api/workspace", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      action: "status",
      id: workspace.applications[0].id,
      status: "Applied",
    },
  });
  expect(changed.ok()).toBeTruthy();
  await page.goto("/");
  const section = page.locator(".application-flow");
  await section.getByLabel("Analytics view").selectOption("transitions");
  await expect(section.getByRole("img")).toBeVisible();
  await expect(section.getByRole("table")).toContainText("SavedApplied1100.0%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("PDF invalid content, size limits, missing fields, and expired session are actionable", async ({
  page,
}) => {
  await page.goto("/discover");
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  const input = page.getByLabel("Job description PDF");
  await input.setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a PDF</html>"),
  });
  await expect(page.locator(".dialog-content .error")).toContainText(
    "not a supported PDF",
  );
  await input.setInputFiles({
    name: "large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.locator(".dialog-content .error")).toContainText("10 MB");
  await input.setInputFiles({
    name: "missing.pdf",
    mimeType: "application/pdf",
    buffer: jobPdf(["Unlabeled employer opportunity", "Work with us."]),
  });
  const review = page.getByRole("dialog", { name: "Review imported job" });
  await expect(review).toContainText("Missing · enter manually");
  await expect(review.getByRole("textbox", { name: /^Company/ })).toHaveValue(
    "",
  );
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await page.getByLabel("Job description PDF").setInputFiles({
    name: "expired.pdf",
    mimeType: "application/pdf",
    buffer: jobPdf(jobLines),
  });
  // A real expired session stays on login; the fixture still has a valid session,
  // so assert the attempted full navigation rather than weakening server auth.
  await expect.poll(() => page.url()).not.toContain("/discover");
});

test("Application Flow uses an empty state until explicit transitions exist", async ({
  page,
}) => {
  await page.getByLabel("Analytics view").selectOption("transitions");
  await expect(page.locator(".application-flow")).toContainText(
    "Your flow starts with a status change",
  );
  await expect(
    page.locator(".application-flow").getByRole("table"),
  ).toHaveCount(0);
});

test("bulk tracker review imports corrected rows, refreshes analytics and safely reimports multiple PDFs", async ({
  page,
}) => {
  const { trackerPdf } = await import("../helpers/job-pdf.mjs");
  await page.goto("/discover");
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await page.getByLabel("Import mode").selectOption("tracker");
  const file = {
    name: "tracker.pdf",
    mimeType: "application/pdf",
    buffer: trackerPdf(),
  };
  await page
    .getByLabel("Application tracker PDFs")
    .setInputFiles([file, { ...file, name: "tracker-copy.pdf" }]);
  await expect(
    page.getByRole("status").filter({ hasText: "Detected" }),
  ).toContainText("Detected 4");
  const before = await (await page.request.get("/api/workspace")).json();
  expect(before.applications).toHaveLength(0);
  await page
    .getByLabel("company row 2", { exact: true })
    .fill("Corrected employer");
  await page.getByLabel("applied_on row 2", { exact: true }).fill("2026-11-01");
  await page
    .getByLabel("Status row 2", { exact: true })
    .selectOption("Applied");
  for (let row = 1; row <= 4; row++) {
    await page
      .getByLabel(`Job type row ${row}`, { exact: true })
      .selectOption("Internship");
    if (row === 4)
      await page
        .getByLabel(`Status row ${row}`, { exact: true })
        .selectOption("Applied");
    await page.getByLabel(`Confirm review row ${row}`, { exact: true }).check();
  }
  await page
    .getByRole("button", {
      name: "Import 4 selected applications",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "created" }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/workspace")).json();
  expect(after.applications).toHaveLength(4);
  expect(after.events).toHaveLength(4);
  expect(
    after.events.every(
      (event: { from_status: string | null }) => event.from_status === null,
    ),
  ).toBeTruthy();
  expect(
    after.applications.find(
      (app: { company: string }) => app.company === "Corrected employer",
    ).source_status,
  ).toBe("Closed");
  // Upload the original bytes: receipt identity survives review corrections.
  await page.getByLabel("Application tracker PDFs").setInputFiles(file);
  for (let row = 1; row <= 4; row++) {
    await page
      .getByLabel(`Job type row ${row}`, { exact: true })
      .selectOption("Internship");
    if (row === 2) {
      await page
        .getByLabel("applied_on row 2", { exact: true })
        .fill("2026-11-01");
      await page
        .getByLabel("Status row 2", { exact: true })
        .selectOption("Applied");
    }
    if (row === 4)
      await page
        .getByLabel("Status row 4", { exact: true })
        .selectOption("Applied");
    await page.getByLabel(`Confirm review row ${row}`, { exact: true }).check();
  }
  await page
    .getByRole("button", {
      name: "Import 4 selected applications",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "duplicate" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/workspace")).json()).applications,
  ).toHaveLength(4);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/");
  await expect(
    page.locator(".application-flow").getByRole("table"),
  ).toContainText("Applied375.0%");
  await page.getByLabel("Analytics view").selectOption("transitions");
  await expect(page.locator(".application-flow")).toContainText(
    "Your flow starts with a status change",
  );
});

test("bulk import API enforces authentication, review validation, origin and per-row failure results", async ({
  page,
}) => {
  const headers = { Origin: new URL(page.url()).origin };
  const valid = {
    id: crypto.randomUUID(),
    import_key: `${"a".repeat(64)}:1:1`,
    company: "API Studio",
    title: "Intern",
    location: "Remote",
    applied_on: "11/01/26",
    source_status: "Applied",
    status: "Applied",
    type: "Internship",
    job_id: null,
    reviewed: true,
  };
  const denied = await page.request.post("/api/import/applications", {
    headers: { Origin: "https://evil.test" },
    data: { rows: [valid] },
  });
  expect(denied.status()).toBe(403);
  const response = await page.request.post("/api/import/applications", {
    headers,
    data: {
      rows: [
        valid,
        {
          ...valid,
          import_key: `${"a".repeat(64)}:1:2`,
          company: "Failed Studio",
          job_id: crypto.randomUUID(),
        },
        { ...valid, reviewed: false },
        {
          ...valid,
          applied_on: "",
          status: "Mystery",
          type: "",
          reviewed: "true",
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.results.map((r: { outcome: string }) => r.outcome)).toEqual([
    "created",
    "error",
    "error",
    "error",
  ]);
  expect(result.results[2].error).toContain("Confirm this row");
  expect(result.results[3].error).toContain("Job type needs confirmation");
  expect(result.results[3].error).toContain("Status needs confirmation");
  expect(result.results[3].error).toContain("Enter a valid application date");
  expect(result.results[3].row).toBe(3);
  expect(result.results[3].error).not.toContain("Invalid option");
  const workspace = await (await page.request.get("/api/workspace")).json();
  expect(workspace.applications).toHaveLength(1);
  expect(workspace.applications[0].applied_on).toBe("2026-11-01");
  expect(workspace.events).toHaveLength(1);
  expect(
    workspace.companies.some(
      (c: { name: string }) => c.name === "Failed Studio",
    ),
  ).toBeFalsy();
  const { request } = await import("@playwright/test");
  const anonymous = await request.newContext();
  try {
    expect(
      (
        await anonymous.post(
          new URL("/api/import/applications", page.url()).href,
          { headers, data: { rows: [valid] } },
        )
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test("bulk drafts normalize short dates, explain missing fields, and preserve edits and boolean confirmations per row", async ({
  page,
}) => {
  const { trackerPdf } = await import("../helpers/job-pdf.mjs");
  await page.goto("/discover");
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await page.getByLabel("Import mode").selectOption("tracker");
  await page.getByLabel("Application tracker PDFs").setInputFiles({
    name: "short-years.pdf",
    mimeType: "application/pdf",
    buffer: trackerPdf([
      [
        ["First Studio", "Intern", "11/10/26", "Remote", "applied"],
        ["Second Studio", "Research", "", "Boston", "Reviewed"],
      ],
    ]),
  });
  const dialog = page.getByRole("dialog");
  await expect(
    page.getByLabel("applied_on row 1", { exact: true }),
  ).toHaveValue("2026-11-10");
  await expect(page.getByLabel("Status row 1", { exact: true })).toHaveValue(
    "Applied",
  );
  await expect(page.getByLabel("Job type row 1", { exact: true })).toHaveValue(
    "",
  );
  await expect(dialog).toContainText("Unknown / Not specified");
  await expect(
    page.getByLabel("Confirm review row 1", { exact: true }),
  ).not.toBeChecked();
  await expect(dialog).toContainText("Row 1: Job type needs confirmation");
  await expect(dialog).toContainText("Row 2: Enter a valid application date");
  await expect(dialog).toContainText("Row 2: Status needs confirmation");
  await expect(dialog).not.toContainText("Invalid option");
  await expect(dialog).not.toContainText("expected true");
  await page.getByLabel("title row 1", { exact: true }).fill("Corrected role");
  await page
    .getByLabel("Job type row 1", { exact: true })
    .selectOption("Co-op");
  await page.getByLabel("Confirm review row 1", { exact: true }).check();
  await page.getByLabel("applied_on row 2", { exact: true }).fill("2026-11-09");
  await page
    .getByLabel("Status row 2", { exact: true })
    .selectOption("Rejected");
  await page
    .getByLabel("Job type row 2", { exact: true })
    .selectOption("Graduate");
  await page.getByLabel("Confirm review row 2", { exact: true }).check();
  await expect(page.getByLabel("title row 1", { exact: true })).toHaveValue(
    "Corrected role",
  );
  await expect(
    page.getByLabel("Confirm review row 1", { exact: true }),
  ).toBeChecked();
  // Editing one row requires its own renewed confirmation, without changing another row.
  await page.getByLabel("location row 1", { exact: true }).fill("New York");
  await expect(
    page.getByLabel("Confirm review row 1", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Confirm review row 2", { exact: true }),
  ).toBeChecked();
  const submit = page.getByRole("button", {
    name: "Import 2 selected applications",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Confirm review row 1", { exact: true }).check();
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/import/applications") &&
      request.method() === "POST",
  );
  await submit.click();
  const payload = (await request).postDataJSON();
  expect(
    payload.rows.every((row: { reviewed: unknown }) => row.reviewed === true),
  ).toBeTruthy();
  expect(
    payload.rows.map((row: { applied_on: string }) => row.applied_on),
  ).toEqual(["2026-11-10", "2026-11-09"]);
  await expect(
    page.getByRole("status").filter({ hasText: "created" }),
  ).toBeVisible();
  const workspace = await (await page.request.get("/api/workspace")).json();
  expect(workspace.applications).toHaveLength(2);
  expect(
    workspace.applications.find(
      (app: { company: string }) => app.company === "Second Studio",
    ).source_status,
  ).toBe("Reviewed");
  expect(workspace.events).toHaveLength(2);
});
