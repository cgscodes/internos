import { test, expect } from "./fixtures";
test("tracks, updates, persists, filters, and deletes an application", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Keep moving forward, Alex." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Test Company");
  await page.getByLabel("Role", { exact: true }).fill("Engineering Intern");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Prepare a portfolio.");
  await page
    .getByLabel("Application deadline", { exact: true })
    .fill("2026-12-01");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/applications");
  await page
    .getByRole("textbox", { name: "Search applications", exact: true })
    .fill("Test Company");
  await page
    .getByRole("button", { name: /Test Company Engineering Intern/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Prepare a portfolio.");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Interview");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search applications", exact: true })
    .fill("Test Company");
  await page
    .getByRole("combobox", { name: "Filter by status", exact: true })
    .selectOption("Interview");
  await page
    .getByRole("button", { name: /Test Company Engineering Intern/ })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Test Company Engineering Intern/ }),
  ).toHaveCount(0);
});
test("discovers, saves, edits profile, and keeps pages within the viewport", async ({
  page,
}) => {
  await page.goto("/discover");
  await page.getByLabel("Search opportunities").fill("Notion");
  await expect(
    page.getByRole("button", { name: "Software Engineer Intern", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save Software Engineer Intern at Notion" })
    .click();
  await expect(
    page
      .locator(".job-card")
      .filter({
        has: page.getByRole("button", {
          name: "Software Engineer Intern",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Remove bookmark" }),
  ).toBeEnabled();
  await page.goto("/settings");
  await page
    .getByRole("textbox", { name: "Full name", exact: true })
    .fill("Jamie Test");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Changes saved");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Keep moving forward, Jamie." }),
  ).toBeVisible();
  for (const route of [
    "/",
    "/discover",
    "/applications",
    "/resumes",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.goto("/resumes");
  await expect(
    page.getByRole("button", { name: "Upload resume" }),
  ).toBeEnabled();
});

test("manually adds an opportunity and supports keyboard dialog dismissal", async ({
  page,
}) => {
  await page.goto("/discover");
  await page
    .getByRole("button", { name: "Add opportunity", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Independent Studio");
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Design Intern");
  await page
    .getByRole("textbox", { name: "Source", exact: true })
    .fill("University board");
  await page
    .getByRole("button", { name: "Save opportunity", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search opportunities" })
    .fill("Independent Studio");
  await page
    .getByRole("button", { name: "Design Intern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Design Intern", exact: true }),
  ).toBeFocused();
});
