"use client";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeNext } from "./redirects";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  NATIVE_FLOW_TTL_MS,
  parseNativeCallback,
} from "./native-contract";
type State = { pending: boolean; error: string };
export function isNativeIOS() {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios"
  );
}
function bounded<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "The sign-in browser did not respond. Please try again or reopen the app.",
          ),
        ),
      AUTH_REQUEST_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(
          new Error("The sign-in browser could not open. Please try again."),
        );
      },
    );
  });
}
export async function createNativeOAuth(
  report: (state: State) => void,
  navigate: (next: string) => void,
  lifecycle?: AbortSignal,
) {
  if (
    !Capacitor.isPluginAvailable("App") ||
    !Capacitor.isPluginAvailable("Browser")
  )
    throw new Error(
      "Native sign-in is unavailable. Sync and rebuild the iOS app with the App and Browser plugins.",
    );
  let phase:
    "idle" | "starting" | "waiting" | "exchanging" | "cancelling" | "done" =
    "idle";
  let generation = 0;
  let disposed = false;
  let expiry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  const stopLifecycle = () => {
    disposed = true;
    generation++;
    if (timer) clearTimeout(timer);
    request?.abort();
  };
  lifecycle?.addEventListener("abort", stopLifecycle, { once: true });
  if (lifecycle?.aborted) stopLifecycle();
  const listeners: PluginListenerHandle[] = [];
  let handling = false;
  const stopTimer = () => {
    if (timer) clearTimeout(timer);
  };
  const json = async (path: string, options: RequestInit = {}) => {
    const controller = new AbortController();
    request = controller;
    const deadline = setTimeout(
      () => controller.abort(),
      AUTH_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => {
        throw new Error(
          "The sign-in request timed out or lost its connection. Please try again.",
        );
      });
      const body = await response.json().catch(() => {
        throw new Error(
          "Sign-in service is unavailable. Check your connection and make sure the web update is deployed, then try again.",
        );
      });
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Sign-in could not be completed. Please try again.",
        );
      return body;
    } finally {
      clearTimeout(deadline);
      if (request === controller) request = undefined;
    }
  };
  const closeBrowser = async () => {
    try {
      await bounded(Browser.close());
    } catch {
      /* The sheet may already be closed. Never log its URL. */
    }
  };
  const cancel = async (
    message = "Sign-in was cancelled. Select Continue with Google to try again.",
  ) => {
    if (disposed || phase === "cancelling" || phase === "done") return;
    const current = ++generation;
    phase = "cancelling";
    stopTimer();
    request?.abort();
    await Promise.allSettled([
      closeBrowser(),
      json("/auth/native/start", { method: "DELETE" }),
    ]);
    if (disposed || current !== generation) return;
    phase = "idle";
    report({ pending: false, error: message });
  };
  const callback = async (value: string) => {
    if (disposed || handling || phase === "done" || phase === "cancelling")
      return;
    // Reject malformed URLs before any async work; only a completed flow nonce is cached.
    let parsed: ReturnType<typeof parseNativeCallback>;
    try {
      parsed = parseNativeCallback(value);
    } catch {
      await cancel(
        "The sign-in callback was invalid. Please start sign-in again.",
      );
      return;
    }
    try {
      if (
        sessionStorage.getItem("internos-native-completed-flow") ===
        parsed.state
      )
        return;
    } catch {
      /* Server state and one-use PKCE codes still reject replays without local storage. */
    }
    handling = true;
    const current = generation;
    phase = "exchanging";
    stopTimer();
    report({ pending: true, error: "" });
    try {
      await closeBrowser();
      if (disposed || current !== generation) return;
      const completed = await json("/auth/native/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (disposed || current !== generation) return;
      const session = await json("/auth/native/session");
      if (disposed || current !== generation) return;
      if (session.authenticated !== true)
        throw new Error(
          "The app could not retain its session. Please restart sign-in.",
        );
      try {
        sessionStorage.setItem("internos-native-completed-flow", parsed.state);
      } catch {
        /* Only the completed flow nonce is stored, never a code or session token. */
      }
      phase = "done";
      report({ pending: false, error: "" });
      navigate(safeNext(completed.next));
    } catch (error) {
      if (!disposed && current === generation)
        await cancel(
          error instanceof Error
            ? error.message
            : "Sign-in failed. Please try again.",
        );
    } finally {
      handling = false;
    }
  };
  try {
    listeners.push(
      await bounded(
        App.addListener("appUrlOpen", (event) => {
          void callback(event.url).catch(() =>
            cancel("Sign-in could not be completed. Please try again."),
          );
        }),
      ),
    );
    listeners.push(
      await bounded(
        Browser.addListener("browserFinished", () => {
          if (phase === "waiting") void cancel();
        }),
      ),
    );
    listeners.push(
      await bounded(
        App.addListener("appStateChange", (state) => {
          if (
            state.isActive &&
            expiry &&
            Date.now() >= expiry &&
            phase === "waiting"
          )
            void cancel(
              "Sign-in timed out. Select Continue with Google to start again.",
            );
        }),
      ),
    );
    const launch = await bounded(App.getLaunchUrl());
    if (launch?.url)
      void callback(launch.url).catch(() =>
        cancel("Sign-in could not be restored. Please start again."),
      );
  } catch {
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
    throw new Error(
      "Native sign-in could not initialize. Reopen the app or sync and rebuild its plugins.",
    );
  }
  return {
    async start(next: string) {
      if (disposed || phase !== "idle") return;
      const current = ++generation;
      phase = "starting";
      report({ pending: true, error: "" });
      expiry = Date.now() + NATIVE_FLOW_TTL_MS;
      timer = setTimeout(() => {
        void cancel(
          "Sign-in timed out. Select Continue with Google to start again.",
        );
      }, NATIVE_FLOW_TTL_MS);
      try {
        const started = await json("/auth/native/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next: safeNext(next) }),
        });
        if (disposed || current !== generation) return;
        const authorization = new URL(started.url);
        const config = getSupabaseConfig();
        if (
          !config ||
          authorization.origin !== new URL(config.url).origin ||
          authorization.pathname !== "/auth/v1/authorize" ||
          authorization.searchParams.get("provider") !== "google"
        )
          throw new Error(
            "The sign-in destination was invalid. Please try again.",
          );
        expiry =
          typeof started.expiresAt === "number" ? started.expiresAt : expiry;
        phase = "waiting";
        await bounded(
          Browser.open({
            url: authorization.href,
            presentationStyle: "fullscreen",
          }),
        );
      } catch (error) {
        if (!disposed && current === generation)
          await cancel(
            error instanceof Error
              ? error.message
              : "Google sign-in could not start. Please try again.",
          );
      }
    },
    cancel: () => cancel(),
    dispose() {
      lifecycle?.removeEventListener("abort", stopLifecycle);
      disposed = true;
      generation++;
      stopTimer();
      request?.abort();
      void Promise.allSettled(listeners.map((listener) => listener.remove()));
    },
  };
}
