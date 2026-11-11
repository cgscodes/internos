"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Your workspace is temporarily unavailable</h1>
        <p>Check your connection and Supabase configuration, then try again.</p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
