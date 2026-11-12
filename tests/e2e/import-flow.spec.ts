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
  await expect(page.locator(".application-flow")).toContainText(
    "Your flow starts with a status change",
  );
  await expect(
    page.locator(".application-flow").getByRole("table"),
  ).toHaveCount(0);
});
