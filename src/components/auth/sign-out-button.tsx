"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const params = useSearchParams();
  return (
    <>
      {params.get("error") === "signout_failed" && (
        <p className="error" role="alert">
          Sign-out could not be completed. Check your connection and try again.
        </p>
      )}
      <form
        action="/auth/logout"
        method="POST"
        onSubmit={() => setPending(true)}
      >
        <Button variant="outline" disabled={pending}>
          {pending ? "Signing out…" : "Sign out"}
        </Button>
      </form>
    </>
  );
}
