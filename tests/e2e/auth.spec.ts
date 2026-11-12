import { test, expect } from "@playwright/test";

test("all dashboard routes and APIs require verified authentication", async ({
  page,
  request,
}) => {
  for (const path of [
    "/",
    "/discover",
    "/applications",
    "/resumes",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  }
  const api = await request.get("/api/workspace");
  expect(api.status()).toBe(401);
  expect(api.headers()["cache-control"]).toContain("no-store");
});
test("Google PKCE login returns to the requested page, persists, and signs out", async ({
  page,
  context,
}) => {
  await page.route("https://images.example.test/avatar.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  );
  await page.goto("/applications");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL("/applications");
  await expect(
    page.getByRole("heading", { name: "Your applications" }),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(
    cookies.some(
      (c) =>
        c.name.includes("-auth-token") &&
        !c.name.includes("verifier") &&
        c.sameSite === "Lax",
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your applications" }),
  ).toBeVisible();
  // Force access-token refresh while retaining a valid refresh token, then exercise a proxy redirect.
  const authCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "sb-127-auth-token",
  )!;
  const state = JSON.parse(
    Buffer.from(
      authCookie.value.slice("base64-".length),
      "base64url",
    ).toString(),
  );
  state.expires_at = 1;
  await context.addCookies([
    {
      ...authCookie,
      value:
        "base64-" + Buffer.from(JSON.stringify(state)).toString("base64url"),
    },
  ]);
  await page.goto("/login?next=%2Fsettings");
  await expect(page).toHaveURL("/settings");
  await expect(
    page.getByRole("textbox", { name: "Email address", exact: true }),
  ).toHaveValue("alex@example.test");
  await expect(
    page.getByRole("button", { name: "Your profile" }).locator("img"),
  ).toHaveAttribute("src", "https://images.example.test/avatar.svg");
  const otherTab = await context.newPage();
  await otherTab.goto("/applications");
  await expect(
    otherTab.getByRole("heading", { name: "Your applications" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await otherTab.bringToFront();
  await expect(otherTab).toHaveURL(/\/login/);
  await otherTab.close();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
  expect(
    (await context.cookies()).filter(
      (c) => c.name.includes("-auth-token") && !c.name.includes("verifier"),
    ),
  ).toHaveLength(0);
});
test("callback errors, missing PKCE, and unsafe next destinations fail safely", async ({
  page,
  request,
}) => {
  for (const path of [
    "/auth/callback?error=access_denied&error_description=DO_NOT_ECHO_THIS",
    "/auth/callback",
    "/auth/callback?code=invalid-test-code&next=//evil.example",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".login-card").getByRole("alert")).toContainText(
      "could not be completed",
    );
    await expect(page.locator("body")).not.toContainText("DO_NOT_ECHO_THIS");
  }
  const denied = await request.post("/auth/logout", {
    headers: { Origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(403);
  await page.goto("/login?next=https%3A%2F%2Fevil.example");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL("/");
});
test("expired sessions are cleared, and forged user cookies cannot authorize access", async ({
  page,
  context,
}) => {
  for (const expired of [false, true]) {
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "forged-user", exp: expired ? 1 : Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.invalid-signature`,
      refresh_token: "expired-refresh",
      expires_at: expired ? 1 : Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: "forged-user", user_metadata: { full_name: "Forged" } },
    };
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value:
          "base64-" +
          Buffer.from(JSON.stringify(session)).toString("base64url"),
        url: "http://127.0.0.1:3100",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/applications");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".login-card").getByRole("alert")).toContainText(
      "session has expired",
    );
    await expect(
      page.getByRole("heading", { name: "Your applications" }),
    ).toHaveCount(0);
    if (expired)
      expect(
        (await context.cookies()).filter(
          (cookie) => cookie.name === "sb-127-auth-token",
        ),
      ).toHaveLength(0);
  }
});
