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
