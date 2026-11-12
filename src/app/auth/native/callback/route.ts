import { isSameOrigin } from "@/lib/auth/origin";
import { nativeCallbackSchema } from "@/lib/auth/native-contract";
import {
  matchNativeFlow,
  clearNativeFlow,
  nativeResponse,
} from "@/lib/auth/native-server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return nativeResponse(
      { error: "Sign-in must complete inside this app." },
      403,
    );
  const parsed = nativeCallbackSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return nativeResponse(
      { error: "Invalid sign-in callback. Please start again." },
      400,
    );
  const flow = await matchNativeFlow(request, parsed.data.state);
  // Do not clear a legitimate in-progress attempt for an unrelated/forged callback.
  if (!flow)
    return nativeResponse(
      {
        error:
          "This sign-in attempt has expired or does not match this app. Please start again.",
      },
      400,
    );
  if (parsed.data.error) {
    await clearNativeFlow(request);
    return nativeResponse(
      { error: "Google sign-in was cancelled or declined. Please try again." },
      400,
    );
  }
  try {
    const client = await createClient({ nativePkce: true });
    const { error } = await client.auth.exchangeCodeForSession(
      parsed.data.code!,
    );
    if (error) throw new Error("Exchange failed");
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) throw new Error("Identity verification failed");
    await clearNativeFlow(request);
    // Cookies are written by the ordinary same-origin response. No session material enters the bridge.
    return nativeResponse({ next: flow.next });
  } catch {
    await clearNativeFlow(request);
    return nativeResponse(
      {
        error:
          "Sign-in could not be completed. Start again to receive a fresh authorization code.",
      },
      400,
    );
  }
}
