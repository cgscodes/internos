"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/auth/redirects";
import { createNativeOAuth, isNativeIOS } from "@/lib/auth/native-oauth";
import { Button } from "@/components/ui/button";
export function GoogleSignInButton({
  next,
  disabled,
}: {
  next: string;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const native = useRef<Promise<
    Awaited<ReturnType<typeof createNativeOAuth>>
  > | null>(null);
  const webTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    const lifecycle = new AbortController();
    if (isNativeIOS()) {
      const controller = createNativeOAuth(
        (state) => {
          if (mounted) {
            setPending(state.pending);
            setError(state.error);
          }
        },
        (destination) =>
          window.location.replace(
            new URL(destination, window.location.origin).href,
          ),
        lifecycle.signal,
      );
      native.current = controller;
      void controller.catch(() => {
        if (mounted)
          setError(
            "Native sign-in is unavailable. Sync and rebuild the App and Browser plugins.",
          );
      });
    }
    return () => {
      mounted = false;
      lifecycle.abort();
      if (webTimer.current) clearTimeout(webTimer.current);
      void native.current
        ?.then((controller) => controller.dispose())
        .catch(() => {});
    };
  }, []);
  return (
    <div className="google-sign-in">
      <Button
        type="button"
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          if (isNativeIOS()) {
            try {
              const controller = await native.current;
              if (!controller)
                throw new Error(
                  "Native sign-in is not ready. Reopen the app and try again.",
                );
              await controller.start(next);
            } catch {
              setPending(false);
              setError(
                "Native sign-in could not start. Sync and rebuild the iOS plugins, then try again.",
              );
            }
            return;
          }
          webTimer.current = setTimeout(() => {
            setPending(false);
            setError(
              "Sign-in did not finish. Check your connection and select Continue with Google to try again.",
            );
          }, 30_000);
          try {
            const callback = new URL("/auth/callback", window.location.origin);
            const destination = safeNext(next);
            if (destination !== "/")
              callback.searchParams.set("next", destination);
            const { error } = await createClient().auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: callback.toString() },
            });
            if (error) throw error;
          } catch {
            if (webTimer.current) clearTimeout(webTimer.current);
            setError(
              "Google sign-in could not start. Check your connection and try again.",
            );
            setPending(false);
          }
        }}
      >
        {pending ? "Connecting to Google…" : "Continue with Google"}
        {pending ? <LoaderCircle size={17} /> : <ArrowRight size={17} />}
      </Button>
      {pending && isNativeIOS() && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void native.current
              ?.then((controller) => controller.cancel())
              .catch(() => {
                setPending(false);
                setError("Sign-in was cancelled. Please try again.");
              });
          }}
        >
          Cancel sign-in
        </Button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
