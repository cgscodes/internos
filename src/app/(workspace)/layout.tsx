import { redirect } from "next/navigation";
import { configured, createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/services/workspace";
import { demo } from "@/lib/demo";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemo = !configured();
  if (!isDemo) {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) redirect("/login");
  }
  const initial = isDemo ? demo : await getWorkspace();
  return (
    <WorkspaceProvider initial={initial} isDemo={isDemo}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
