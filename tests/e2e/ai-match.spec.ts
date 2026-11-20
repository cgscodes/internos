import { test, expect } from "./fixtures";
import { jobPdf } from "../helpers/job-pdf.mjs";
import {
  modelFindings,
  resumeText,
  jobDescription,
} from "../helpers/ai-match.mjs";

async function setup(page: import("@playwright/test").Page) {
  const upload = await page.request.post("/api/resumes", {
    headers: { Origin: new URL(page.url()).origin },
    multipart: {
      file: {
        name: "Engineering resume.pdf",
        mimeType: "application/pdf",
        buffer: jobPdf(resumeText.split("\n")),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const resumeId = (await upload.json()).id;
  const jobId = crypto.randomUUID();
  const response = await page.request.post("/api/workspace", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      action: "job.create",
      data: {
        id: jobId,
        company: "Matching Studio",
        title: "Engineering role",
        location: "Remote",
        type: "Internship",
        source: "Test fixture",
        description: jobDescription,
        url: "",
        deadline: "",
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  expect(
    (
      await page.request.post("/api/workspace", {
        headers: { Origin: new URL(page.url()).origin },
        data: { action: "bookmark", job_id: jobId, saved: true },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/discover");
  await page
    .getByRole("button", {
      name: "View Engineering role at Matching Studio",
      exact: true,
    })
    .click();
  return { jobId, resumeId };
}

test("saved resume matching renders grounded results, cached snapshots, errors, and explicit reanalysis", async ({
  page,
}) => {
  const { jobId, resumeId } = await setup(page);
  const output = modelFindings();
  const analysis = {
    id: crypto.randomUUID(),
    job_id: jobId,
    resume_id: resumeId,
    model: "mock-gemini",
    created_at: "2026-11-20T12:00:00Z",
    match_score: 78,
    findings: { ...output, match_score: 78, eligibility_status: "Unknown" },
  };
  let requests = 0;
  await page.route("**/api/ai/match**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { analysis: null } });
    const args = route.request().postDataJSON();
    expect(args.resume_id).toBe(resumeId);
    requests++;
    if (requests === 2) {
      expect(args.refresh).toBeTruthy();
      return route.fulfill({
        status: 429,
        json: {
          error:
            "Gemini quota is temporarily unavailable. Wait before trying again.",
        },
      });
    }
    await route.fulfill({ json: { analysis, cached: true } });
  });
  await page
    .getByLabel("Resume version", { exact: true })
    .selectOption(resumeId);
  await expect(page.locator(".match-panel")).toContainText("No saved analysis");
  await page
    .getByRole("button", { name: "Analyze Match", exact: true })
    .click();
  await expect(page.locator(".match-score")).toContainText("78");
  await expect(page.locator(".match-panel")).toContainText(
    "Eligibility: Unknown",
  );
  await expect(page.locator(".match-panel")).toContainText(
    "Not a hiring probability or ATS score",
  );
  await expect(page.locator(".match-panel")).toContainText("Cached result");
  await page
    .getByRole("button", { name: "Analyze Again", exact: true })
    .click();
  await expect(page.locator(".match-panel").getByRole("alert")).toContainText(
    "quota",
  );
  await expect(page.locator(".match-score")).toContainText("78"); // Prior saved snapshot survives a failed refresh.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("real match endpoint authenticates, loads private resume PDF text, and fails gracefully without a configured model key", async ({
  page,
}) => {
  const { jobId, resumeId } = await setup(page);
  await page
    .getByLabel("Resume version", { exact: true })
    .selectOption(resumeId);
  await page
    .getByRole("button", { name: "Analyze Match", exact: true })
    .click();
  await expect(page.locator(".match-panel").getByRole("alert")).toContainText(
    "not configured",
  );
  await expect(page.locator(".match-score")).toHaveCount(0);
  const response = await page.request.post("/api/ai/match", {
    headers: { Origin: new URL(page.url()).origin },
    data: { job_id: jobId, resume_id: crypto.randomUUID() },
  });
  expect(response.status()).toBe(404);
  const { request } = await import("@playwright/test");
  const anonymous = await request.newContext();
  try {
    const denied = await anonymous.post(
      new URL("/api/ai/match", page.url()).href,
      {
        headers: { Origin: new URL(page.url()).origin },
        data: { job_id: jobId, resume_id: resumeId },
      },
    );
    expect(denied.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});
