import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNativeCallback,
  NATIVE_CALLBACK,
} from "../src/lib/auth/native-contract.ts";
const state = "a".repeat(64);
test("native callbacks accept only the registered scheme, route, nonce and PKCE code", () => {
  assert.deepEqual(
    parseNativeCallback(`${NATIVE_CALLBACK}?state=${state}&code=test-code`),
    { state, code: "test-code" },
  );
  assert.deepEqual(
    parseNativeCallback(
      `${NATIVE_CALLBACK}?state=${state}&error=access_denied&error_description=do-not-display`,
    ),
    { state, error: "access_denied" },
  );
  for (const value of [
    `https://example.test/callback?state=${state}&code=test-code`,
    `com.internos.mobile://evil/callback?state=${state}&code=test-code`,
    `com.internos.mobile://auth/elsewhere?state=${state}&code=test-code`,
    `${NATIVE_CALLBACK}?state=${state}&code=test-code&next=https://evil.test`,
    `${NATIVE_CALLBACK}?state=${state}&code=test-code&code=another`,
    `${NATIVE_CALLBACK}?state=wrong&code=test-code`,
    `${NATIVE_CALLBACK}?state=${state}&code=test-code#error=access_denied`,
    `${NATIVE_CALLBACK}?state=${state}#access_token=forbidden`,
    `${NATIVE_CALLBACK}?state=${state}&code=test-code&error=access_denied`,
    `${NATIVE_CALLBACK}?state=${state}&code=${"x".repeat(9000)}`,
  ])
    assert.throws(() => parseNativeCallback(value));
});

test("HTTPS return relay uses verified LiveContainer forwarding and carries no session material", async () => {
  const { nativeReturnLinks } =
    await import("../src/lib/auth/native-return.ts");
  const links = nativeReturnLinks(`?state=${state}&code=one-use-pkce-code`);
  assert.equal(parseNativeCallback(links.app).code, "one-use-pkce-code");
  for (const [index, link] of links.containers.entries()) {
    const url = new URL(link);
    assert.equal(
      url.protocol,
      `${["livecontainer", "livecontainer2", "livecontainer3"][index]}:`,
    );
    assert.equal(url.hostname, "open-url");
    assert.equal(
      Buffer.from(url.searchParams.get("url")!, "base64").toString(),
      links.app,
    );
  }
  for (const query of [
    `?state=${state}&access_token=forbidden`,
    `?state=${state}&code=ok&next=https://evil.test`,
    `?state=${state}&code=ok&code=again`,
    `?state=invalid&code=ok`,
  ])
    assert.throws(() => nativeReturnLinks(query));
});

test("LiveContainer host envelopes decode once and reject untrusted or malformed forwarding", () => {
  const callback = `${NATIVE_CALLBACK}?state=${state}&code=one-use-code`;
  const wrap = (value: string, scheme = "livecontainer") => {
    const url = new URL(`${scheme}://open-url`);
    url.searchParams.set("url", Buffer.from(value).toString("base64"));
    return url.href;
  };
  for (const scheme of ["livecontainer", "livecontainer2", "livecontainer3"])
    assert.deepEqual(parseNativeCallback(wrap(callback, scheme)), {
      state,
      code: "one-use-code",
    });
  for (const value of [
    wrap("https://evil.test/callback"),
    wrap(wrap(callback)),
    wrap(callback, "unknownhost"),
    wrap(callback) + "&url=duplicate",
    wrap(callback) + "&access_token=forbidden",
    wrap(callback) + "#fragment",
    "livecontainer://open-url?url=not_base64",
    wrap(callback).replace("open-url", "livecontainer-launch"),
    wrap(`${NATIVE_CALLBACK}?state=${state}&code=ok&refresh_token=forbidden`),
  ])
    assert.throws(() => parseNativeCallback(value));
});

test("native authorization requires the same-origin HTTPS relay and S256 PKCE rather than a direct guest callback", async () => {
  const { validateNativeAuthorization } =
    await import("../src/lib/auth/native-contract.ts");
  const app = "https://internos-green.vercel.app",
    auth = "https://project.supabase.co";
  const redirect = `${app}/auth/native/return?state=${state}&target=livecontainer`;
  const url = new URL(`${auth}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirect);
  url.searchParams.set("code_challenge", "a".repeat(43));
  url.searchParams.set("code_challenge_method", "s256");
  assert.equal(validateNativeAuthorization(url.href, auth, app).href, url.href);
  for (const [key, value] of [
    ["redirect_to", `${NATIVE_CALLBACK}?state=${state}`],
    ["redirect_to", `https://evil.test/auth/native/return?state=${state}`],
    ["redirect_to", redirect + "&target=livecontainer"],
    ["code_challenge_method", "plain"],
    ["code_challenge", ""],
    ["provider", "other"],
  ]) {
    const invalid = new URL(url);
    invalid.searchParams.set(key, value);
    assert.throws(() => validateNativeAuthorization(invalid.href, auth, app));
  }
});

test("relay target selection keeps the callback inside a documented host envelope", async () => {
  const { nativeReturnLinks } =
    await import("../src/lib/auth/native-return.ts");
  const result = nativeReturnLinks(
    `?state=${state}&target=livecontainer&code=ok`,
  );
  assert.equal(parseNativeCallback(result.containers[0]).code, "ok");
  assert.throws(() =>
    nativeReturnLinks(`?state=${state}&target=https://evil.test&code=ok`),
  );
  assert.throws(() =>
    nativeReturnLinks(
      `?state=${state}&target=livecontainer&target=livecontainer&code=ok`,
    ),
  );
});
