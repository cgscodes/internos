import { createClient, configured } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  if (!configured())
    return NextResponse.redirect(
      new URL(
        "/login?error=Configure+Supabase+to+connect+your+account",
        request.url,
      ),
    );
  const client = await createClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", request.url).toString() },
  });
  if (error || !data.url)
    return NextResponse.redirect(
      new URL("/login?error=Google+sign-in+could+not+start", request.url),
    );
  return NextResponse.redirect(data.url);
}
