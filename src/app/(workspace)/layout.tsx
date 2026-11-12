import { requireUser } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/services/workspace";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const initial = await getWorkspace();
  return (
    <WorkspaceProvider key={user.id} initial={initial} isDemo={false}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
