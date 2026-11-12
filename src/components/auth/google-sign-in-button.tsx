"use client";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/auth/redirects";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton({
  next,
  disabled,
}: {
  next: string;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="google-sign-in">
      <Button
        type="button"
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError("");
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
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
