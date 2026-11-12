import { isSameOrigin } from "@/lib/auth/origin";
import { authorized } from "@/lib/supabase/server";
import { z } from "zod";
const types: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const { client, user } = await authorized();
    const form = await request.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 5 * 1024 * 1024 ||
      file.size === 0
    )
      throw new Error("Choose a file between 1 byte and 5 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!types[ext] || file.type !== types[ext])
      throw new Error("Only PDF and DOCX files are supported.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ext === "pdf" && String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("The file is not a valid PDF.");
    if (ext === "docx" && (bytes[0] !== 80 || bytes[1] !== 75))
      throw new Error("The file is not a valid DOCX.");
    const parentValue = form.get("parent_id");
    const parent = parentValue ? z.uuid().parse(parentValue) : null;
    if (parent) {
      z.uuid().parse(parent);
      const { data } = await client
        .from("resumes")
        .select("id")
        .eq("id", parent)
        .eq("user_id", user.id)
        .single();
      if (!data) throw new Error("Resume version parent not found.");
    }
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.${ext}`;
    const { error: uploadError } = await client.storage
      .from("resumes")
      .upload(path, bytes, { contentType: types[ext], upsert: false });
    if (uploadError) throw uploadError;
    const { count, error: countError } = await client
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) {
      await client.storage.from("resumes").remove([path]);
      throw countError;
    }
    const { error } = await client.from("resumes").insert({
      id,
      user_id: user.id,
      name: file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      size: file.size,
      storage_path: path,
      is_master: count === 0,
      parent_id: parent || null,
    });
    if (error) {
      await client.storage.from("resumes").remove([path]);
      throw error;
    }
    return Response.json({ id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      {
        status: e instanceof Error && e.message === "Unauthorized" ? 401 : 400,
      },
    );
  }
}
export async function GET(request: Request) {
  try {
    const { client, user } = await authorized();
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { data, error } = await client
      .from("resumes")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (error || !data) throw new Error("Document not found.");
    const { data: link, error: linkError } = await client.storage
      .from("resumes")
      .createSignedUrl(data.storage_path, 60, { download: true });
    if (linkError) throw linkError;
    return Response.json(
      { url: link.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 400 },
    );
  }
}
