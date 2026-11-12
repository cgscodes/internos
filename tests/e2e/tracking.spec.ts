import { test, expect } from "./fixtures";
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    company: "Tracking Test Studio",
    title: "Engineering Intern",
    location: "Remote",
    description: "Role requirements",
    type: "Internship",
    source: "Manual test",
    url: "https://example.test/real-posting",
    deadline: "2099-12-01",
    status: "Saved",
    notes: "PRIVATE_TRACKING_NOTE",
    important_date: "",
    applied_on: "",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("empty accounts, persisted fields, status history, duplicates, and dashboard counts", async ({
  page,
}) => {
  for (const label of [
    "Applications tracked",
    "Applications submitted",
    "Active interviews",
    "Offers received",
  ])
    await expect(
      page
        .locator(".metric-card")
        .filter({ hasText: label })
        .locator(".metric-value"),
    ).toHaveText("00");
  await expect(
    page.getByRole("heading", { name: "Your story starts here" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await page
    .getByLabel("Company", { exact: true })
    .fill("Tracking Test Studio");
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Engineering Intern");
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill("Real requirements to remember");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Personal preparation notes");
  await page.getByLabel("Date applied", { exact: false }).fill("2026-11-10");
  await page
    .getByLabel("Application deadline", { exact: true })
    .fill("2099-12-01");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Applied");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .locator(".metric-card")
      .filter({ hasText: "Applications submitted" })
      .locator(".metric-value"),
  ).toHaveText("01");
  await expect(page.locator(".deadlines-panel")).toContainText(
    "Tracking Test Studio",
  );
  await page.goto("/applications");
  await page
    .getByRole("combobox", {
      name: "Status for Engineering Intern at Tracking Test Studio",
    })
    .selectOption("Interview");
  await expect(
    page.getByRole("combobox", {
      name: "Status for Engineering Intern at Tracking Test Studio",
    }),
  ).toHaveValue("Interview");
  await page.reload();
  await page
    .getByRole("button", {
      name: "Tracking Test Studio Engineering Intern",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Job description", exact: true }),
  ).toHaveValue("Real requirements to remember");
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Personal preparation notes");
  await expect(page.getByLabel("Date applied", { exact: false })).toHaveValue(
    "2026-11-10",
  );
  await expect(page.locator(".application-history")).toContainText(
    "Applied → Interview",
  );
  const data = await (await page.request.get("/api/workspace")).json();
  const duplicate = await page.request.post("/api/workspace", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      action: "application.create",
      data: { ...data.applications[0], id: crypto.randomUUID() },
    },
  });
  expect(duplicate.status()).toBe(409);
  expect(
    (await (await page.request.get("/api/workspace")).json()).applications,
  ).toHaveLength(1);
  await page.goto("/");
  await expect(
    page
      .locator(".metric-card")
      .filter({ hasText: "Active interviews" })
      .locator(".metric-value"),
  ).toHaveText("01");
});

test("private job editing, company reuse, bookmarking, and application from a saved job", async ({
  page,
}) => {
  await page.goto("/discover");
  await page
    .getByRole("button", { name: "Add opportunity", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Private Job Studio");
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Design Internship");
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill("A real manual description");
  await page
    .getByRole("textbox", { name: "Original posting URL", exact: true })
    .fill("https://example.test/design");
  await page
    .getByRole("button", { name: "Save opportunity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Design Internship", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit opportunity", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Product Design Internship");
  await page
    .getByRole("button", { name: "Save opportunity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Product Design Internship", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Original posting" }),
  ).toHaveAttribute("href", "https://example.test/design");
  await page
    .getByRole("button", { name: "Bookmark opportunity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove bookmark", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start application", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await (await page.request.get("/api/workspace")).json();
  const job = data.jobs.find(
    (j: { title: string }) => j.title === "Product Design Internship",
  );
  expect(data.bookmarks).toContain(job.id);
  expect(data.applications[0].job_id).toBe(job.id);
  expect(data.applications[0].description).toBe("A real manual description");
  expect(
    data.companies.filter(
      (company: { name: string }) => company.name === "Private Job Studio",
    ),
  ).toHaveLength(1);
  await page
    .getByRole("combobox", { name: "Filter bookmarks" })
    .selectOption("Bookmarked");
  await expect(
    page.getByRole("button", {
      name: "Product Design Internship",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Product Design Internship",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("direct API isolation, validation, and failed status updates leave records unchanged", async ({
  page,
  browser,
}) => {
  const origin = new URL(page.url()).origin;
  const create = await page.request.post("/api/workspace", {
    headers: { Origin: origin },
    data: { action: "application.create", data: payload() },
  });
  expect(create.ok()).toBeTruthy();
  const own = await create.json();
  const application = own.applications[0];
  const job = own.jobs.find((j: { id: string }) => j.id === application.job_id);
  await page.goto("/applications");
  await page.route("**/api/workspace", (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "status"
    )
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Test status update failed" }),
      });
    return route.continue();
  });
  const status = page.getByRole("combobox", {
    name: "Status for Engineering Intern at Tracking Test Studio",
  });
  await status.selectOption("Interview");
  await expect(page.locator(".toast-error")).toContainText(
    "Test status update failed",
  );
  await expect(status).toHaveValue("Saved");
  await page.unroute("**/api/workspace");
  const invalid = await page.request.post("/api/workspace", {
    headers: { Origin: origin },
    data: {
      action: "application.create",
      data: payload({ notes: "x".repeat(10001) }),
    },
  });
  expect(invalid.status()).toBe(400);
  const forged = await page.request.post("/api/workspace", {
    headers: { Origin: origin },
    data: { action: "delete", id: application.id, user_id: "forged" },
  });
  expect(forged.status()).toBe(400);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto(origin + "/login");
    await other.getByRole("button", { name: "Continue with Google" }).click();
    await expect(
      other.getByRole("heading", { name: "Keep moving forward, Alex." }),
    ).toBeVisible();
    const isolated = await (
      await other.request.get(origin + "/api/workspace")
    ).json();
    expect(isolated.applications).toHaveLength(0);
    expect(JSON.stringify(isolated)).not.toContain("PRIVATE_TRACKING_NOTE");
    expect(
      isolated.jobs.some((j: { id: string }) => j.id === job.id),
    ).toBeFalsy();
    for (const mutation of [
      { action: "delete", id: application.id },
      { action: "status", id: application.id, status: "Offer" },
      { action: "application.update", data: application },
      { action: "job.update", data: job },
      { action: "bookmark", job_id: job.id, saved: true },
    ]) {
      const result = await other.request.post(origin + "/api/workspace", {
        headers: { Origin: origin },
        data: mutation,
      });
      expect(result.status()).toBe(404);
    }
    expect(
      (await (await page.request.get("/api/workspace")).json()).applications[0]
        .status,
    ).toBe("Saved");
  } finally {
    await context.close();
  }
});
