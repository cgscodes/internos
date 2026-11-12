import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin } from "./origin";
import { safeNext } from "./redirects";
import { nativeState, NATIVE_FLOW_TTL_MS } from "./native-contract";
const storedFlow = z.object({
  state: nativeState,
  next: z.string().max(2048),
  expires: z.number(),
});
function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: appOrigin(request).startsWith("https:"),
    sameSite: "strict" as const,
    path: "/",
    maxAge: NATIVE_FLOW_TTL_MS / 1000,
  };
}
function cookieName(request: Request) {
  return appOrigin(request).startsWith("https:")
    ? "__Host-internos-native-oauth"
    : "internos-native-oauth-local";
}
export function newNativeFlow(next: string) {
  return {
    state: randomBytes(32).toString("hex"),
    next: safeNext(next),
    expires: Date.now() + NATIVE_FLOW_TTL_MS,
  };
}
export async function setNativeFlow(
  request: Request,
  flow: ReturnType<typeof newNativeFlow>,
) {
  (await cookies()).set(
    cookieName(request),
    Buffer.from(JSON.stringify(flow)).toString("base64url"),
    cookieOptions(request),
  );
}
export async function matchNativeFlow(request: Request, state: string) {
  try {
    const value = (await cookies()).get(cookieName(request))?.value;
    if (!value) return null;
    const flow = storedFlow.parse(
      JSON.parse(Buffer.from(value, "base64url").toString()),
    );
    if (
      flow.expires <= Date.now() ||
      state.length !== flow.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))
    )
      return null;
    return { ...flow, next: safeNext(flow.next) };
  } catch {
    return null;
  }
}
export async function clearNativeFlow(request: Request, clearVerifier = true) {
  const store = await cookies();
  const options = { ...cookieOptions(request), maxAge: 0 };
  store.set(cookieName(request), "", options);
  if (clearVerifier)
    for (const cookie of store.getAll())
      if (/^sb-.+-auth-token-code-verifier(?:\.\d+)?$/.test(cookie.name))
        store.set(cookie.name, "", { ...options, sameSite: "lax" });
}
export function nativeResponse(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
