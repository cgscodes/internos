import { appOrigin } from "@/lib/auth/origin";
import { createClient, configured } from "@/lib/supabase/server";
import { loginPath, safeNext } from "@/lib/auth/redirects";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const failure = () =>
    NextResponse.redirect(
      new URL(loginPath(next, "oauth_failed"), appOrigin(request)),
    );
  if (!configured())
    return NextResponse.redirect(
      new URL(loginPath(next, "configuration"), appOrigin(request)),
    );
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return failure();
  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return failure();
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) return failure();
    return NextResponse.redirect(new URL(next, appOrigin(request)));
  } catch {
    return failure();
  }
}
