"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { loginPath } from "@/lib/auth/redirects";

export function SessionListener() {
  useEffect(() => {
    const client = createClient();
    let navigating = false;
    const leaveWorkspace = () => {
      if (navigating) return;
      navigating = true;
      // A full navigation discards cached private pages after logout or session expiry.
      window.location.replace(
        new URL(
          loginPath(window.location.pathname, "session_expired"),
          window.location.origin,
        ).href,
      );
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") leaveWorkspace();
    });
    const checkSession = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        // Server sign-out in another tab changes cookies without an SDK broadcast.
        const {
          data: { user },
          error,
        } = await client.auth.getUser();
        if (!user && (!error || [400, 401, 403].includes(error.status ?? 0)))
          leaveWorkspace();
      } catch {
        /* A transient network failure is retried on the next focus. */
      }
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("internos-auth");
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "SIGNED_OUT") leaveWorkspace();
      };
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      subscription.unsubscribe();
      channel?.close();
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, []);
  return null;
}
