import {
  BriefcaseBusiness,
  ShieldCheck,
  ArrowUpRight,
  Layers3,
} from "lucide-react";
import { redirect } from "next/navigation";
import { configured, getVerifiedUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirects";
import { AppearanceMenu } from "@/components/design/appearance";
import { SignedOutNotice } from "@/components/auth/signed-out-notice";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
const messages: Record<string, string> = {
  oauth_failed:
    "Google sign-in was cancelled or could not be completed. Please try again.",
  session_expired: "Your session has expired. Sign in again to continue.",
  configuration:
    "Sign-in is not configured yet. Please check the Supabase environment settings.",
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getVerifiedUser()) redirect(next);
  const enabled = configured();
  const message =
    messages[params.error || ""] ||
    (!enabled ? messages.configuration : undefined);
  return (
    <main className="login-page">
      <div className="login-appearance">
        <AppearanceMenu />
      </div>
      <div className="login-layout">
        <aside className="login-story">
          <div className="brand">
            <span className="brand-icon">
              <BriefcaseBusiness size={21} />
            </span>
            <span>
              Intern<span className="brand-os">OS</span>
            </span>
          </div>
          <div className="eyebrow">A CLEAR SPACE FOR WHAT’S NEXT</div>
          <h1>
            Your next chapter
            <br />
            starts here.
          </h1>
          <p>
            Find the right opportunities. Keep every application in view. Make a
            little progress, every day.
          </p>
          <div className="login-story-footer">
            <Layers3 size={18} />
            <span>One workspace. Every next step.</span>
            <ArrowUpRight size={18} />
          </div>
        </aside>
        <section className="login-card">
          <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
          <h2>Good to have you here.</h2>
          <p>
            Your internship search, thoughtfully organized. Sign in to pick up
            where you left off.
          </p>
          {message && (
            <p role="alert" className="error">
              {message}
            </p>
          )}
          {params.notice === "signed_out" && <SignedOutNotice />}
          <GoogleSignInButton next={next} disabled={!enabled} />
          <small>
            <ShieldCheck size={16} />
            <span>
              Just you and your next chapter.
              <br />
              Your workspace stays private.
            </span>
          </small>
        </section>
      </div>
    </main>
  );
}
