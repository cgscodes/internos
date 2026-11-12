"use client";
import Image from "next/image";
import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";

/** Keeps the existing avatar geometry and falls back when Google has no photo or its URL expires. */
export function UserAvatar() {
  const { data } = useWorkspace();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const picture = data.identity?.avatar_url;
  const initials =
    data.profile.full_name
      .trim()
      .split(/\s+/)
      .map((name) => name[0])
      .slice(0, 2)
      .join("") || "U";
  return picture && picture !== failedUrl ? (
    <Image
      src={picture}
      width={44}
      height={44}
      alt=""
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(picture)}
    />
  ) : (
    <span aria-hidden="true">{initials}</span>
  );
}
