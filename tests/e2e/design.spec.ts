import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import type { Resume } from "../../src/lib/models";
import type { Page } from "@playwright/test";

async function createApplication(
  page: Page,
  status = "Saved",
  company = "Sample Studio",
) {
  const result = await page.request.post("/api/workspace", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      action: "application.create",
      data: {
        id: crypto.randomUUID(),
        company,
        title: "Product Design Intern",
        location: "Remote",
        description: "Synthetic record for UI verification.",
        type: "Internship",
        source: "Design test fixture",
        url: "",
        deadline: "2026-12-01",
        status,
        notes: "Prepare portfolio case studies.",
        important_date: "",
        applied_on: "",
        created_at: new Date().toISOString(),
      },
    },
  });
  expect(result.ok()).toBeTruthy();
}

test("appearance persists, profile and notifications work, and opaque and motion fallbacks apply", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const appearance = page.getByRole("dialog", {
    name: "Appearance",
    exact: true,
  });
  await appearance
    .getByRole("button", { name: "Dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.getByRole("switch").check();
  await expect(page.locator(".utility-bar")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Appearance", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-transparency",
    "reduced",
  );
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  const profile = page.getByRole("dialog", {
    name: "Your workspace",
    exact: true,
  });
  await expect(profile).toContainText("alex@example.test");
  await expect(
    profile.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await profile.getByRole("link", { name: "Profile & settings" }).click();
  await expect(page).toHaveURL("/settings");
  await page.getByRole("button", { name: "System theme", exact: true }).click();
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "reduce",
    contrast: "more",
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(page.locator(".utility-bar")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".utility-bar")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await page.getByRole("button", { name: "Workspace notifications" }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace updates" }),
  ).toContainText("You’re all caught up");
  await page.keyboard.press("Escape");
});

test("board and list preserve edits; modal scrolling, focus, and mobile targets work", async ({
  page,
  isMobile,
}) => {
  await createApplication(page);
  await page.goto("/applications");
  if (!isMobile) {
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator(".pipeline-list")).toBeVisible();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.locator(".pipeline-list")).toHaveCount(0);
  }
  await page
    .getByRole("button", {
      name: "Sample Studio Product Design Intern",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Prepare portfolio case studies.");
  await dialog
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Updated from redesigned dialog.");
  await dialog
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Sample Studio Product Design Intern",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Updated from redesigned dialog.");
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Sample Studio Product Design Intern",
      exact: true,
    }),
  ).toBeFocused();
  if (isMobile) {
    for (const link of await page.locator(".bottom-nav a").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const bar = await page.locator(".bottom-nav").boundingBox();
    expect(bar!.y + bar!.height).toBeLessThan(page.viewportSize()!.height);
  }
});

test("all pages are accessible and fit the viewport in light and dark; capture design previews", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await createApplication(page, "Interview");
  await createApplication(page, "Preparing", "Example Research");
  const capture = process.env.CAPTURE_DESIGN === "1";
  if (capture) await mkdir("artifacts/redesign", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      localStorage.setItem("internos-ui:theme", theme);
      window.dispatchEvent(new Event("internos-appearance"));
    }, theme);
    for (const [name, path] of [
      ["overview", "/"],
      ["discover", "/discover"],
      ["applications", "/applications"],
      ["resumes", "/resumes"],
      ["settings", "/settings"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        `${theme} ${name}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
      if (capture && ["desktop", "iphone"].includes(testInfo.project.name)) {
        await page.screenshot({
          path: `artifacts/redesign/${name}-${theme}-${testInfo.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  if (capture && ["desktop", "iphone"].includes(testInfo.project.name))
    await page.screenshot({
      path: `artifacts/redesign/login-dark-${testInfo.project.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
});

test("resume upload errors remain actionable and restore the upload control", async ({
  page,
}) => {
  await page.goto("/resumes");
  await page.route("**/api/resumes", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Upload unavailable. Please try again." }),
    }),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "test-resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic upload UI test"),
  });
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Upload unavailable. Please try again.",
  );
  await expect(
    page.getByRole("button", { name: "Upload resume", exact: true }),
  ).toBeEnabled();
});

test("resume metadata, version uploads, and downloads remain connected (simulated storage)", async ({
  page,
  context,
}) => {
  const workspace = await (await page.request.get("/api/workspace")).json();
  const masterId = crypto.randomUUID();
  const master: Resume = {
    id: masterId,
    name: "Portfolio resume",
    storage_path: "test-only/portfolio.pdf",
    file_name: "portfolio.pdf",
    size: 2048,
    is_master: true,
    parent_id: null,
    created_at: new Date().toISOString(),
  };
  const documents: Resume[] = [];
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { ...workspace, resumes: documents } })
      : route.continue(),
  );
  await page.route("**/api/resumes*", async (route) => {
    if (route.request().method() === "POST") {
      if (documents.length) {
        expect(route.request().postData()).toContain(masterId);
        documents.push({
          ...master,
          id: crypto.randomUUID(),
          name: "Design resume",
          file_name: "design.pdf",
          is_master: false,
          parent_id: masterId,
        });
      } else documents.push(master);
      await route.fulfill({ json: { ok: true } });
    } else
      await route.fulfill({
        json: { url: "https://documents.example.test/signed-preview" },
      });
  });
  await context.route("https://documents.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: "Synthetic download target",
    }),
  );
  await page.goto("/resumes");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "portfolio.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("synthetic master UI test"),
    });
  await expect(page.getByText("Master resume", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New version", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "design.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic document UI test"),
  });
  await expect(page.getByText("Resume version", { exact: true })).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Download Design resume", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(
    "https://documents.example.test/signed-preview",
  );
  await popup.close();
});
