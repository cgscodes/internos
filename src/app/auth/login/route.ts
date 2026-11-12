import { appOrigin } from "@/lib/auth/origin";
import {
  createClient,
  configured,
  getVerifiedUser,
} from "@/lib/supabase/server";
import { loginPath, safeNext } from "@/lib/auth/redirects";
import { NextResponse } from "next/server";

/** Compatibility endpoint for existing Connect Google links. The login page uses the browser client. */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (!configured())
    return NextResponse.redirect(
      new URL(loginPath(next, "configuration"), appOrigin(request)),
    );
  if (await getVerifiedUser())
    return NextResponse.redirect(new URL(next, appOrigin(request)));
  try {
    const client = await createClient();
    const callback = new URL("/auth/callback", appOrigin(request));
    if (next !== "/") callback.searchParams.set("next", next);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (!error && data.url) return NextResponse.redirect(data.url);
  } catch {
    /* Return a fixed message; do not log authorization URLs or tokens. */
  }
  return NextResponse.redirect(
    new URL(loginPath(next, "oauth_failed"), appOrigin(request)),
  );
}
