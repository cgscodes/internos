"use client";
import { useEffect } from "react";

/** Broadcast only after the server has completed sign-out and rendered the login page. */
export function SignedOutNotice() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("internos-auth");
    channel.postMessage("SIGNED_OUT");
    channel.close();
  }, []);
  return <p role="status">You’ve been signed out.</p>;
}
