import type { Database } from "@/lib/database.types";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseConfig, sessionCookieOptions } from "./config";
import { loginPath } from "@/lib/auth/redirects";
export { configured } from "./config";

export async function createClient({
  nativePkce = false,
}: { nativePkce?: boolean } = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const store = await cookies();
  const requestHeaders = await headers();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: sessionCookieOptions(
      requestHeaders.get("x-forwarded-proto") === "https" ||
        process.env.NODE_ENV === "production",
    ),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(
              name,
              value,
              nativePkce && name.includes("-code-verifier")
                ? { ...options, httpOnly: true, maxAge: value ? 180 : 0 }
                : options,
            ),
          );
        } catch {
          /* Server Components are read-only; proxy refreshes and writes cookies before rendering. */
        }
      },
    },
  });
}

/** Request-local memoization only. Authorization always verifies with the Auth server. */
export const getVerifiedUser = cache(async () => {
  if (!getSupabaseConfig()) return null;
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    return error ? null : user;
  } catch {
    return null;
  }
});

export async function requireUser(next = "/") {
  const user = await getVerifiedUser();
  if (!user) redirect(loginPath(next));
  return user;
}

export async function authorized() {
  const user = await getVerifiedUser();
  if (!user) throw new Error("Unauthorized");
  return { client: await createClient(), user };
}
