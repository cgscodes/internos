import { appOrigin } from "@/lib/auth/origin";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, sessionCookieOptions } from "@/lib/supabase/config";
import { isDashboardPath, loginPath, safeNext } from "@/lib/auth/redirects";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const protectedPage = isDashboardPath(pathname);
  const config = getSupabaseConfig();
  const hadSession = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("code-verifier"),
    );
  let authenticated = false;
  if (config) {
    const client = createServerClient(config.url, config.key, {
      cookieOptions: sessionCookieOptions(
        request.nextUrl.protocol === "https:",
      ),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          // Preserve every pending cookie if the SDK writes more than once during refresh.
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request });
          previous.forEach((cookie) => response.cookies.set(cookie));
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    try {
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      authenticated = !error && Boolean(user);
    } catch {
      /* Fail closed. Network failures must never expose a protected page. */
    }
  }
  let destination: string | undefined;
  if (protectedPage && !authenticated)
    destination = loginPath(
      pathname + request.nextUrl.search,
      !config ? "configuration" : hadSession ? "session_expired" : undefined,
    );
  if (pathname === "/login" && authenticated)
    destination = safeNext(request.nextUrl.searchParams.get("next"));
  if (destination) {
    const redirected = NextResponse.redirect(
      new URL(destination, appOrigin(request)),
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirected.cookies.set(cookie));
    response = redirected;
  }
  if (pathname.startsWith("/api/") && !authenticated) {
    const denied = NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    response = denied;
  }
  // Authenticated HTML, refreshed cookies, and auth redirects must never enter a shared cache.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  if (pathname.startsWith("/auth/"))
    response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
