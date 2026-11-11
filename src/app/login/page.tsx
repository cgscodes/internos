import Link from "next/link";
import { BriefcaseBusiness, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {configured() ? (
          <Button asChild>
            <a href="/auth/login">
              Continue with Google
              <ArrowRight size={17} />
            </a>
          </Button>
        ) : (
          <>
            <div className="info-banner">
              Account sign-in needs Supabase configuration. Follow the README to
              connect your own project.
            </div>
            <Button asChild>
              <Link href="/">
                Explore the demo
                <ArrowRight size={17} />
              </Link>
            </Button>
          </>
        )}
        <small>
          <ShieldCheck size={15} />
          Your search is personal. Your workspace stays private.
        </small>
      </div>
    </main>
  );
}
