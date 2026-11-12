import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeNext,
  loginPath,
  isDashboardPath,
} from "../src/lib/auth/redirects.ts";
import { userIdentity } from "../src/lib/auth/identity.ts";
import {
  getSupabaseConfig,
  sessionCookieOptions,
} from "../src/lib/supabase/config.ts";
import type { User } from "@supabase/supabase-js";

test("OAuth destinations reject external URLs, encoded bypasses, and auth loops", () => {
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/auth/logout",
    "/login",
    "javascript:alert(1)",
    "/applications%0d%0aLocation:evil",
    "/applications/../../auth/login",
    "/%E0%A4%A",
  ])
    assert.equal(safeNext(path), "/", path);
  for (const path of [
    "/discover",
    "/applications?status=Interview",
    "/resumes",
    "/settings",
    "/applications/detail",
  ])
    assert.equal(safeNext(path), path);
  assert.equal(loginPath("//evil.example"), "/login");
  assert.equal(
    loginPath("/settings", "session_expired"),
    "/login?next=%2Fsettings&error=session_expired",
  );
  assert.equal(isDashboardPath("/applications/one"), true);
  assert.equal(isDashboardPath("/applications-elsewhere"), false);
});
test("display identity only accepts HTTPS photos and has safe missing-metadata fallbacks", () => {
  const user = {
    id: "user",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-11-12T12:00:00Z",
    email: "alex@example.test",
    user_metadata: {
      full_name: "Alex Morgan",
      picture: "https://example.test/photo",
    },
  } as User;
  assert.equal(userIdentity(user).full_name, "Alex Morgan");
  assert.equal(userIdentity(user).avatar_url, "https://example.test/photo");
  assert.equal(
    userIdentity({ ...user, user_metadata: { picture: "javascript:alert(1)" } })
      .avatar_url,
    null,
  );
  assert.equal(userIdentity({ ...user, user_metadata: {} }).full_name, "alex");
});
test("Supabase configuration rejects privileged keys; cookies use HTTPS and same-site protection", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_test_only";
    assert.equal(getSupabaseConfig(), null);
    const jwt = (role: string) =>
      `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwt("service_role");
    assert.equal(getSupabaseConfig(), null);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwt("anon");
    assert.ok(getSupabaseConfig());
    assert.deepEqual(sessionCookieOptions(true), {
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test("canonical origin ignores untrusted forwarding headers", async () => {
  const { appOrigin, isSameOrigin } = await import("../src/lib/auth/origin.ts");
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://internos.example";
    const request = new Request("http://localhost:3000/auth/callback", {
      headers: {
        "x-forwarded-host": "evil.example",
        origin: "https://internos.example",
      },
    });
    assert.equal(appOrigin(request), "https://internos.example");
    assert.equal(isSameOrigin(request), true);
    assert.equal(
      isSameOrigin(
        new Request(request.url, {
          headers: { origin: "https://evil.example" },
        }),
      ),
      false,
    );
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});
