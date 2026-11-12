"use client";
import { useState } from "react";
import {
  Save,
  ShieldCheck,
  LockKeyhole,
  Link2,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { profileSchema } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
export default function Settings() {
  const { data, isDemo, saveProfile, busy } = useWorkspace();
  const [error, setError] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Your workspace, your way</h1>
          <p>A little about you. A clearer direction for what comes next.</p>
        </div>
      </div>
      <div className="settings-layout">
        <form
          className="panel settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const result = profileSchema.safeParse(
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            if (!result.success) {
              setError(result.error.issues[0].message);
              return;
            }
            try {
              await saveProfile(result.data);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Unable to save profile",
              );
            }
          }}
        >
          <div className="section-heading">
            <div>
              <h2>Personal profile</h2>
              <p>The person behind the applications.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Full name
              <input
                name="full_name"
                required
                defaultValue={data.profile.full_name}
              />
            </label>
            <label>
              Email address
              <input
                value={
                  data.email ||
                  (isDemo
                    ? "Demo account · Connect to add your email"
                    : "Managed by Google")
                }
                disabled
                readOnly
              />
            </label>
            <label>
              Education
              <textarea
                name="education"
                rows={2}
                defaultValue={data.profile.education}
                placeholder="Degree, institution, expected graduation"
              />
            </label>
            <label>
              Skills
              <textarea
                name="skills"
                rows={2}
                defaultValue={data.profile.skills}
                placeholder="Add your technical and professional skills"
              />
            </label>
            <label>
              Career interests
              <input
                name="interests"
                defaultValue={data.profile.interests}
                placeholder="Roles, industries, or teams"
              />
            </label>
            <label>
              Preferred locations
              <input
                name="locations"
                defaultValue={data.profile.locations}
                placeholder="Cities and remote preferences"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button disabled={busy} type="submit">
                <Save size={16} />
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
        <div className="settings-side">
          <section className="panel settings-card">
            <ShieldCheck size={22} />
            <h2>Account security</h2>
            <p>
              {isDemo
                ? "Connect your Google account to keep your workspace private and sync your progress."
                : "Signed in securely with Google. Manage your password and two-factor authentication in your Google account."}
            </p>
            {isDemo ? (
              <Button asChild variant="outline">
                <a href="/auth/login">
                  Connect Google
                  <ArrowUpRight size={16} />
                </a>
              </Button>
            ) : (
              <SignOutButton />
            )}
          </section>
          <section className="panel settings-card">
            <LockKeyhole size={22} />
            <h2>Privacy controls</h2>
            <p>
              Your applications, notes, and documents are private to your
              account. You can delete individual applications in their detail
              view.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (isDemo) {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "internos-demo-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  const a = document.createElement("a");
                  a.href = "/api/export";
                  a.download = "internos-export.json";
                  a.click();
                }
              }}
            >
              <Download size={16} />
              Export my data
            </Button>
          </section>
          <section className="panel settings-card">
            <Link2 size={22} />
            <h2>Integrations</h2>
            <div className="integration-line">
              <span>Supabase</span>
              <span className="status">
                {isDemo ? "Not configured" : "Connected"}
              </span>
            </div>
            <div className="integration-line">
              <span>Google OAuth</span>
              <span className="subtle-label">
                {isDemo ? "NOT CONNECTED" : "CONNECTED"}
              </span>
            </div>
            <div className="integration-line">
              <span>OpenAI</span>
              <span className="subtle-label">NOT CONNECTED</span>
            </div>
            <p>
              AI matching and resume tailoring are intentionally deferred. No
              profile data is sent to OpenAI.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
