"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { Application, Workspace, Profile } from "@/lib/models";
import type { JobInput, WorkspaceMutation } from "@/lib/validation/tracking";
import { applicationSchema, jobSchema } from "@/lib/models";
import { loginPath } from "@/lib/auth/redirects";
import { Button } from "./ui/button";
async function readWorkspace(response: Response): Promise<Workspace> {
  if (response.status === 401) {
    window.location.replace(
      new URL(
        loginPath(window.location.pathname, "session_expired"),
        window.location.origin,
      ).href,
    );
    throw new Error("Your session has expired. Please sign in again.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load workspace");
  return data;
}
type Context = {
  data: Workspace;
  isDemo: boolean;
  busy: boolean;
  error: string;
  save: (app: Application) => Promise<void>;
  saveJob: (job: JobInput) => Promise<void>;
  setStatus: (id: string, status: Application["status"]) => Promise<void>;
  bookmark: (job_id: string, saved: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  reload: () => Promise<void>;
  notice: string;
  notify: (message: string) => void;
};
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: Workspace;
  isDemo?: boolean;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, notify] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const mutate = async (mutation: WorkspaceMutation) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      });
      setData(await readWorkspace(response));
      notify("Changes saved");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save");
      throw error;
    } finally {
      setBusy(false);
    }
  };
  const reload = useCallback(async () => {
    try {
      setData(
        await readWorkspace(
          await fetch("/api/workspace", { cache: "no-store" }),
        ),
      );
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reload");
    }
  }, []);
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        isDemo: false,
        busy,
        error,
        notice,
        notify,
        reload,
        save: (app) =>
          mutate({
            action: data.applications.some((a) => a.id === app.id)
              ? "application.update"
              : "application.create",
            data: applicationSchema.parse(app),
          }),
        saveJob: (job) =>
          mutate({
            action: data.jobs.some((j) => j.id === job.id)
              ? "job.update"
              : "job.create",
            data: jobSchema.parse(job),
          }),
        setStatus: (id, status) => mutate({ action: "status", id, status }),
        bookmark: (job_id, saved) =>
          mutate({ action: "bookmark", job_id, saved }),
        remove: (id) => mutate({ action: "delete", id }),
        saveProfile: (profile) => mutate({ action: "profile", data: profile }),
      }}
    >
      {children}
      {notice && !error && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="toast toast-error">
          <span>{error}</span>
          <Button variant="outline" onClick={() => void reload()}>
            Reload workspace
          </Button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider is required");
  return context;
}
