import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/origin";
import { createClient, configured } from "@/lib/supabase/server";
import {
  newNativeFlow,
  setNativeFlow,
  clearNativeFlow,
  nativeResponse,
} from "@/lib/auth/native-server";
import { NATIVE_CALLBACK } from "@/lib/auth/native-contract";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return nativeResponse({ error: "Sign-in must start from this app." }, 403);
  if (!configured())
    return nativeResponse(
      { error: "Sign-in is not configured. Please try again after setup." },
      503,
    );
  try {
    const { next } = z
      .object({ next: z.string().max(2048).default("/") })
      .strict()
      .parse(await request.json());
    const flow = newNativeFlow(next);
    const callback = new URL(NATIVE_CALLBACK);
    callback.searchParams.set("state", flow.state);
    const client = await createClient({ nativePkce: true });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.href, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw new Error("OAuth start failed");
    await setNativeFlow(request, flow);
    return nativeResponse({ url: data.url, expiresAt: flow.expires });
  } catch {
    await clearNativeFlow(request);
    return nativeResponse(
      { error: "Google sign-in could not start. Please try again." },
      400,
    );
  }
}
export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return nativeResponse({ error: "Invalid origin" }, 403);
  await clearNativeFlow(request);
  return nativeResponse({ cancelled: true });
}
