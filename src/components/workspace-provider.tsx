"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Application, Workspace, Profile } from "@/lib/models";
import { demo } from "@/lib/demo";
import { applicationSchema, profileSchema } from "@/lib/models";
type Context = {
  data: Workspace;
  isDemo: boolean;
  busy: boolean;
  error: string;
  save: (app: Application) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  reload: () => Promise<void>;
  notice: string;
  notify: (message: string) => void;
};
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({
  initial,
  isDemo,
  children,
}: {
  initial: Workspace;
  isDemo: boolean;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, notify] = useState("");
  useEffect(() => {
    if (!isDemo) return;
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("internos-demo-v1");
        if (saved) {
          const parsed = JSON.parse(saved) as Workspace;
          if (
            !Array.isArray(parsed.applications) ||
            !Array.isArray(parsed.jobs) ||
            !Array.isArray(parsed.events) ||
            !Array.isArray(parsed.resumes) ||
            !profileSchema.safeParse(parsed.profile).success ||
            !parsed.applications.every(
              (a) => applicationSchema.safeParse(a).success,
            ) ||
            !parsed.jobs.every((a) => applicationSchema.safeParse(a).success)
          )
            throw new Error("Invalid demo data");
          setData(parsed);
        }
      } catch {
        localStorage.removeItem("internos-demo-v1");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isDemo]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const persist = (next: Workspace) => {
    setData(next);
    if (isDemo) localStorage.setItem("internos-demo-v1", JSON.stringify(next));
  };
  const mutate = async (
    action: string,
    payload: object,
    local: () => Workspace,
  ) => {
    setBusy(true);
    setError("");
    try {
      if (isDemo) {
        persist(local());
      } else {
        const res = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setData(result);
      }
      notify("Changes saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save";
      setError(message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const reload = useCallback(async () => {
    const res = await fetch("/api/workspace");
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    setData(result);
  }, []);
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        isDemo,
        busy,
        error,
        notice,
        notify,
        reload,
        save: (app) =>
          mutate("application", { data: app }, () => ({
            ...data,
            applications: [
              app,
              ...data.applications.filter((a) => a.id !== app.id),
            ],
            events: [
              {
                id: crypto.randomUUID(),
                application_id: app.id,
                description: `${app.status} · ${app.title} at ${app.company}`,
                created_at: new Date().toISOString(),
              },
              ...data.events,
            ],
          })),
        remove: (id) =>
          mutate("delete", { id }, () => ({
            ...data,
            applications: data.applications.filter((a) => a.id !== id),
            events: data.events.filter((e) => e.application_id !== id),
          })),
        saveProfile: (profile) =>
          mutate("profile", { data: profile }, () => ({ ...data, profile })),
      }}
    >
      {children}
      {notice && (
        <div role="status" className="toast">
          {notice}
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
export { demo };
