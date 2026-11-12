import { appOrigin, isSameOrigin } from "@/lib/auth/origin";
import { createClient, configured } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!configured())
    return NextResponse.redirect(new URL("/login", appOrigin(request)), 303);
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      return NextResponse.redirect(
        new URL("/settings?error=signout_failed", appOrigin(request)),
        303,
      );
    return NextResponse.redirect(
      new URL("/login?notice=signed_out", appOrigin(request)),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings?error=signout_failed", appOrigin(request)),
      303,
    );
  }
}
