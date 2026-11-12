import { BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { configured, getVerifiedUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirects";
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
      <div className="login-card">
        <span className="brand-icon">
          <BriefcaseBusiness size={26} />
        </span>
        <div className="eyebrow">WELCOME TO INTERNOS</div>
        <h1>
          Your next chapter
          <br />
          starts here.
        </h1>
        <p>
          A thoughtful place to find opportunities, manage applications, and
          move forward.
        </p>
        {message && (
          <p role="alert" className="error">
            {message}
          </p>
        )}
        {params.notice === "signed_out" && <SignedOutNotice />}
        <GoogleSignInButton next={next} disabled={!enabled} />
        <small>
          <ShieldCheck size={15} />
          Your search is personal. Your workspace stays private.
        </small>
      </div>
    </main>
  );
}
