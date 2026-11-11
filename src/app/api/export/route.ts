import { getWorkspace } from "@/lib/services/workspace";
export async function GET() {
  try {
    return new Response(JSON.stringify(await getWorkspace(), null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="internos-export.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Please sign in to export your data." },
      { status: 401 },
    );
  }
}
