"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>We couldn’t load your workspace</h1>
      <p>Check your connection and Supabase setup, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
