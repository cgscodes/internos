/** Both values are public project credentials. Never use a secret/service-role key here. */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (key.startsWith("sb_secret_")) return null;
  // Legacy anon JWT keys remain supported, but privileged JWT keys are rejected.
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") return null;
    } catch {
      return null;
    }
  }
  return { url, key };
}
export const configured = () => Boolean(getSupabaseConfig());

export function sessionCookieOptions(secure: boolean) {
  // Supabase's browser PKCE client and refresh listener must read the auth cookies.
  return { path: "/", sameSite: "lax" as const, secure, httpOnly: false };
}
