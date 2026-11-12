"use client";
import type { Database } from "@/lib/database.types";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, sessionCookieOptions } from "./config";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return createBrowserClient<Database>(config.url, config.key, {
    cookieOptions: sessionCookieOptions(window.location.protocol === "https:"),
    // The server callback owns the code exchange; never consume OAuth codes in the browser.
    auth: { detectSessionInUrl: false },
  });
}
