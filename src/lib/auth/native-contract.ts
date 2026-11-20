import { z } from "zod";
export const NATIVE_CALLBACK = "com.internos.mobile://auth/callback";
export const NATIVE_FLOW_TTL_MS = 180_000;
export const AUTH_REQUEST_TIMEOUT_MS = 15_000;
export const nativeState = z.string().regex(/^[a-f0-9]{64}$/);
export const nativeCallbackSchema = z
  .object({
    state: nativeState,
    code: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9._~-]+$/)
      .optional(),
    error: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.code) !== Boolean(value.error),
    "Expected an authorization code or an OAuth error",
  );
const liveContainerSchemes = [
  "livecontainer:",
  "livecontainer2:",
  "livecontainer3:",
];
/** Accept the documented host envelope if an LC build forwards it without unwrapping.
 * Only a single base64-encoded callback is accepted; authentication still occurs on the server.
 */
export function parseNativeCallback(value: string) {
  if (value.length > 12000) throw new Error("Invalid native callback");
  const envelope = new URL(value);
  if (liveContainerSchemes.includes(envelope.protocol)) {
    if (
      envelope.hostname !== "open-url" ||
      envelope.pathname ||
      envelope.username ||
      envelope.password ||
      envelope.port ||
      envelope.hash ||
      [...envelope.searchParams.keys()].length !== 1 ||
      envelope.searchParams.getAll("url").length !== 1
    )
      throw new Error("Invalid native callback");
    const encoded = envelope.searchParams.get("url")!;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
      throw new Error("Invalid native callback");
    value = atob(encoded);
  }
  if (value.length > 8192) throw new Error("Invalid native callback");
  const url = new URL(value);
  if (
    url.protocol !== "com.internos.mobile:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("Invalid native callback");
  const allowed = ["state", "code", "error", "error_code", "error_description"];
  for (const key of url.searchParams.keys())
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw new Error("Invalid native callback");
  return nativeCallbackSchema.parse({
    state: url.searchParams.get("state"),
    ...(url.searchParams.has("code")
      ? { code: url.searchParams.get("code") }
      : {}),
    ...(url.searchParams.has("error")
      ? { error: url.searchParams.get("error") }
      : {}),
  });
}

/** Fail before opening Safari when a stale start endpoint returns a direct/foreign callback. */
export function validateNativeAuthorization(
  value: string,
  supabaseUrl: string,
  appOrigin: string,
) {
  const authorization = new URL(value);
  const redirect = new URL(
    authorization.searchParams.get("redirect_to") || "invalid:",
  );
  const allowed = ["state", "target"];
  if (
    authorization.origin !== new URL(supabaseUrl).origin ||
    authorization.pathname !== "/auth/v1/authorize" ||
    authorization.username ||
    authorization.password ||
    authorization.hash ||
    authorization.searchParams.get("provider") !== "google" ||
    authorization.searchParams.getAll("redirect_to").length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(
      authorization.searchParams.get("code_challenge") || "",
    ) ||
    authorization.searchParams.get("code_challenge_method")?.toLowerCase() !==
      "s256" ||
    redirect.origin !== appOrigin ||
    redirect.pathname !== "/auth/native/return" ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    !nativeState.safeParse(redirect.searchParams.get("state")).success ||
    [...redirect.searchParams.keys()].some(
      (key) =>
        !allowed.includes(key) ||
        redirect.searchParams.getAll(key).length !== 1,
    ) ||
    (redirect.searchParams.has("target") &&
      redirect.searchParams.get("target") !== "livecontainer")
  )
    throw new Error(
      "The sign-in return destination is invalid. Deploy the current web version and allow the HTTPS native return URL in Supabase before trying again.",
    );
  return authorization;
}
