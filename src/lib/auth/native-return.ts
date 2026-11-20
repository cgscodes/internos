import { NATIVE_CALLBACK, parseNativeCallback } from "./native-contract.ts";

/** Verified against LiveContainer 3.8.0 LCSharedUtils.m and UIKit+GuestHooks.m.
 * The relay carries a short-lived, one-use PKCE code, never a session or verifier.
 * This public Safari endpoint cannot authenticate a flow; only the app-side POST can.
 */
export function nativeReturnLinks(search: string) {
  const params = new URLSearchParams(search);
  if (params.has("target")) {
    if (
      params.getAll("target").length !== 1 ||
      params.get("target") !== "livecontainer"
    )
      throw new Error("Invalid return target");
    params.delete("target");
  }
  const incoming = `${NATIVE_CALLBACK}?${params}`;
  const parsed = parseNativeCallback(incoming);
  const callback = new URL(NATIVE_CALLBACK);
  callback.searchParams.set("state", parsed.state);
  if (parsed.code) callback.searchParams.set("code", parsed.code);
  if (parsed.error) callback.searchParams.set("error", parsed.error);
  return {
    app: callback.href,
    containers: ["livecontainer", "livecontainer2", "livecontainer3"].map(
      (scheme) => {
        const url = new URL(`${scheme}://open-url`);
        url.searchParams.set(
          "url",
          Buffer.from(callback.href, "utf8").toString("base64"),
        );
        return url.href;
      },
    ),
    declined: Boolean(parsed.error),
  };
}
