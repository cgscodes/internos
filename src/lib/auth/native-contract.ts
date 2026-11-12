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
export function parseNativeCallback(value: string) {
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
