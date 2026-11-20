import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3100";
async function nativeBridge(page: Page) {
  await page.addInitScript(() => {
    type Callback = (data: Record<string, unknown>) => void;
    const listeners = new Map<string, Map<string, Callback>>();
    let id = 0;
    const emit = (event: string, data: Record<string, unknown>) =>
      listeners.get(event)?.forEach((callback) => callback(data));
    const bridge = {
      opened: "",
      closeCount: 0,
      launch: "",
      emit,
      ready: () =>
        listeners.has("appUrlOpen") && listeners.has("browserFinished"),
    };
    Object.assign(window, {
      __nativeTest: bridge,
      CapacitorCustomPlatform: { name: "ios" },
      Capacitor: {
        PluginHeaders: [
          {
            name: "App",
            methods: [
              { name: "getLaunchUrl", rtype: "promise" },
              { name: "addListener", rtype: "callback" },
              { name: "removeListener", rtype: "promise" },
            ],
          },
          {
            name: "Browser",
            methods: [
              { name: "open", rtype: "promise" },
              { name: "close", rtype: "promise" },
              { name: "addListener", rtype: "callback" },
              { name: "removeListener", rtype: "promise" },
            ],
          },
        ],
        nativeCallback(
          _plugin: string,
          method: string,
          options: { eventName: string },
          callback: Callback,
        ) {
          if (method !== "addListener")
            throw new Error("Unexpected test bridge method");
          const callbackId = String(++id);
          if (!listeners.has(options.eventName))
            listeners.set(options.eventName, new Map());
          listeners.get(options.eventName)!.set(callbackId, callback);
          return callbackId;
        },
        async nativePromise(
          plugin: string,
          method: string,
          options: {
            url?: string;
            eventName?: string;
            callbackId?: string;
          } = {},
        ) {
          if (method === "removeListener") {
            listeners.get(options.eventName!)?.delete(options.callbackId!);
            return;
          }
          if (plugin === "App" && method === "getLaunchUrl")
            return Reflect.get(window, "__nativeColdLaunchUrl") || bridge.launch
              ? {
                  url:
                    Reflect.get(window, "__nativeColdLaunchUrl") ||
                    bridge.launch,
                }
              : {};
          if (plugin === "Browser" && method === "open") {
            bridge.opened = options.url || "";
            return;
          }
          if (plugin === "Browser" && method === "close") {
            bridge.closeCount++;
            emit("browserFinished", {});
            return;
          }
          throw new Error("Unexpected test bridge method");
        },
      },
    });
  });
}
async function openedAuthorization(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "__nativeTest").opened as string),
    )
    .not.toBe("");
  return page.evaluate(
    () => Reflect.get(window, "__nativeTest").opened as string,
  );
}
async function callbackFor(page: Page, url: string) {
  const response = await page.request.get(url, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const returned = response.headers().location;
  const relay = await page.request.get(returned);
  expect(relay.status()).toBe(200);
  expect(relay.headers()["referrer-policy"]).toBe("no-referrer");
  const match = (await relay.text()).match(
    /href="(com\.internos\.mobile:[^"]+)"/,
  );
  expect(match).toBeTruthy();
  return match![1].replaceAll("&amp;", "&");
}

test("native handoff exchanges inside the app, persists server cookies, rejects replay and signs out", async ({
  page,
  context,
}) => {
  await nativeBridge(page);
  await page.goto("/login?next=%2Fapplications");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const url = await openedAuthorization(page);
  expect(new URL(new URL(url).searchParams.get("redirect_to")!).protocol).toBe(
    "http:",
  );
  const verifier = (await context.cookies()).find((cookie) =>
    cookie.name.includes("-code-verifier"),
  );
  expect(verifier?.httpOnly).toBeTruthy();
  const callback = await callbackFor(page, url);
  let completion: Record<string, unknown> | undefined;
  page.on("response", (response) => {
    if (response.url().endsWith("/auth/native/callback"))
      void response.json().then((body) => {
        completion = body;
      });
  });
  await page.evaluate(
    (value) =>
      Reflect.get(window, "__nativeTest").emit("appUrlOpen", { url: value }),
    callback,
  );
  await expect(
    page.getByRole("heading", { name: "Your applications" }),
  ).toBeVisible();
  expect(Object.keys(completion || {})).toEqual(["next"]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your applications" }),
  ).toBeVisible();
  const parsed = new URL(callback);
  const replay = await page.request.post("/auth/native/callback", {
    headers: { Origin: origin },
    data: {
      state: parsed.searchParams.get("state"),
      code: parsed.searchParams.get("code"),
    },
  });
  expect(replay.status()).toBe(400);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/applications");
  await expect(page).toHaveURL(/\/login/);
});

test("cold launch recovery completes without Safari sharing any app cookies", async ({
  page,
  context,
}) => {
  await nativeBridge(page);
  await page.goto("/login");
  const started = await page.request.post("/auth/native/start", {
    headers: { Origin: origin },
    data: { next: "/resumes" },
  });
  const data = await started.json();
  // The system browser has its own empty cookie jar. Only the authorization URL crosses to it.
  const { request } = await import("@playwright/test");
  const systemBrowser = await request.newContext();
  let callback: string;
  try {
    const response = await systemBrowser.get(data.url, { maxRedirects: 0 });
    const returned = response.headers().location;
    const relay = await systemBrowser.get(returned);
    const match = (await relay.text()).match(
      /href="(com\.internos\.mobile:[^"]+)"/,
    );
    expect(match).toBeTruthy();
    callback = match![1].replaceAll("&amp;", "&");
    expect((await systemBrowser.storageState()).cookies).toHaveLength(0);
  } finally {
    await systemBrowser.dispose();
  }
  await page.addInitScript((value) => {
    Reflect.set(window, "__nativeColdLaunchUrl", value);
  }, callback!);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A home for your resumes" }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some(
      (cookie) =>
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("verifier"),
    ),
  ).toBeTruthy();
});

test("native cancellation, invalid callbacks, missing state, and foreign origin fail without hanging", async ({
  page,
}) => {
  await nativeBridge(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await openedAuthorization(page);
  await page.evaluate(() =>
    Reflect.get(window, "__nativeTest").emit("browserFinished", {}),
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(page.locator(".google-sign-in .error")).toContainText(
    "cancelled",
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel sign-in" }),
  ).toBeVisible();
  await page.evaluate(() =>
    Reflect.get(window, "__nativeTest").emit("appUrlOpen", {
      url: "com.internos.mobile://evil/callback?code=test-only",
    }),
  );
  await expect(page.locator(".google-sign-in .error")).toContainText("invalid");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  const foreign = await page.request.post("/auth/native/start", {
    headers: { Origin: "https://evil.test" },
    data: { next: "/" },
  });
  expect(foreign.status()).toBe(403);
  const invalid = await page.request.post("/auth/native/callback", {
    headers: { Origin: origin },
    data: { state: "a".repeat(64), code: "test-only" },
  });
  expect(invalid.status()).toBe(400);
  await page.route("**/auth/native/start", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 404,
          contentType: "text/html",
          body: "<!doctype html><title>Not deployed</title>",
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator(".google-sign-in .error")).toContainText(
    "service is unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});

test("native nonce and PKCE must match; callbacks never choose external destinations", async ({
  page,
}) => {
  await page.goto("/login");
  const started = await (
    await page.request.post("/auth/native/start", {
      headers: { Origin: origin },
      data: { next: "https://evil.test" },
    })
  ).json();
  const callback = await callbackFor(page, started.url);
  const parsed = new URL(callback);
  const wrong = await page.request.post("/auth/native/callback", {
    headers: { Origin: origin },
    data: { state: "b".repeat(64), code: parsed.searchParams.get("code") },
  });
  expect(wrong.status()).toBe(400);
  const completed = await page.request.post("/auth/native/callback", {
    headers: { Origin: origin },
    data: {
      state: parsed.searchParams.get("state"),
      code: parsed.searchParams.get("code"),
    },
  });
  expect(completed.ok()).toBeTruthy();
  expect(await completed.json()).toEqual({ next: "/" });
});

test("native total timeout resets loading with an actionable retry", async ({
  page,
}) => {
  await page.clock.install();
  await nativeBridge(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await openedAuthorization(page);
  await page.clock.fastForward(181_000);
  await expect(page.locator(".google-sign-in .error")).toContainText(
    "timed out",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});

test("an expired native flow or missing WebView PKCE verifier cannot create a session", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  for (const expired of [true, false]) {
    const started = await (
      await page.request.post("/auth/native/start", {
        headers: { Origin: origin },
        data: { next: "/" },
      })
    ).json();
    const callback = new URL(await callbackFor(page, started.url));
    if (expired) {
      const flow = (await context.cookies()).find(
        (cookie) => cookie.name === "internos-native-oauth-local",
      )!;
      const state = JSON.parse(Buffer.from(flow.value, "base64url").toString());
      state.expires = 1;
      await context.addCookies([
        {
          ...flow,
          value: Buffer.from(JSON.stringify(state)).toString("base64url"),
        },
      ]);
    } else await context.clearCookies({ name: /code-verifier/ });
    const response = await page.request.post("/auth/native/callback", {
      headers: { Origin: origin },
      data: {
        state: callback.searchParams.get("state"),
        code: callback.searchParams.get("code"),
      },
    });
    expect(response.status()).toBe(400);
    expect(
      await (await page.request.get("/auth/native/session")).json(),
    ).toEqual({ authenticated: false });
  }
});

test("main LiveContainer forwarding establishes a persistent session and rejects a replayed envelope", async ({
  page,
}) => {
  await nativeBridge(page);
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  const auth = await openedAuthorization(page);
  const redirect = new URL(new URL(auth).searchParams.get("redirect_to")!);
  expect(redirect.pathname).toBe("/auth/native/return");
  expect(redirect.searchParams.get("target")).toBe("livecontainer");
  const browser = await (await import("@playwright/test")).request.newContext();
  let forwarded: string;
  try {
    const response = await browser.get(auth, { maxRedirects: 0 });
    const relay = await browser.get(response.headers().location);
    const html = await relay.text();
    expect(relay.headers()["content-security-policy"]).toContain(
      "default-src 'none'",
    );
    const match = html.match(/href="(livecontainer:\/\/open-url[^\"]+)"/);
    expect(match).toBeTruthy();
    forwarded = match![1].replaceAll("&amp;", "&");
    expect((await browser.storageState()).cookies).toHaveLength(0);
  } finally {
    await browser.dispose();
  }
  await page.evaluate(
    (url) => Reflect.get(window, "__nativeTest").emit("appUrlOpen", { url }),
    forwarded!,
  );
  await expect(
    page.getByRole("heading", { name: "Keep moving forward, Alex." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Keep moving forward, Alex." }),
  ).toBeVisible();
  const callback = new URL(
    Buffer.from(
      new URL(forwarded!).searchParams.get("url")!,
      "base64",
    ).toString(),
  );
  const replay = await page.request.post("/auth/native/callback", {
    headers: { Origin: origin },
    data: {
      state: callback.searchParams.get("state"),
      code: callback.searchParams.get("code"),
    },
  });
  expect(replay.status()).toBe(400);
});

test("a stale direct-callback authorization URL is rejected before Safari opens", async ({
  page,
}) => {
  await nativeBridge(page);
  await page.goto("/login");
  const invalid = new URL("http://127.0.0.1:54329/auth/v1/authorize");
  invalid.searchParams.set("provider", "google");
  invalid.searchParams.set(
    "redirect_to",
    `com.internos.mobile://auth/callback?state=${"a".repeat(64)}`,
  );
  invalid.searchParams.set("code_challenge", "b".repeat(43));
  invalid.searchParams.set("code_challenge_method", "s256");
  await page.route("**/auth/native/start", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { url: invalid.href } })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(page.locator(".google-sign-in .error")).toContainText(
    "return destination is invalid",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "__nativeTest").opened),
  ).toBe("");
});
