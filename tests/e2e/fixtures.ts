import { test as base, expect } from "@playwright/test";
export const test = base.extend({
  page: async ({ page }, runFixture) => {
    await page.route("https://images.example.test/avatar.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="#3468a3"/></svg>',
      }),
    );
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Continue with Google", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Keep moving forward, Alex." }),
    ).toBeVisible();
    await runFixture(page);
  },
});
export { expect };
