import { nativeReturnLinks } from "@/lib/auth/native-return";
export async function GET(request: Request) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
  let content: string;
  let status = 200;
  try {
    const links = nativeReturnLinks(new URL(request.url).search);
    content = `<h1>${links.declined ? "Sign-in was declined" : "Return to InternOS"}</h1>
    <p>For InternOS inside the main LiveContainer, tap Open in LiveContainer below. Safari cannot open a guest app’s own URL scheme directly.</p>
    <a href="${escape(links.containers[0])}">Open in LiveContainer</a>
    <p>Keep the original InternOS guest open. If LiveContainer asks which app to use, select InternOS in the same data container where sign-in started.</p>
    <details><summary>Using another installation?</summary><a href="${escape(links.containers[1])}">Open in LiveContainer 2</a><a href="${escape(links.containers[2])}">Open in LiveContainer 3</a>
    <a href="${escape(links.app)}">Open directly installed InternOS</a></details>
    <p>If nothing opens, return to InternOS and cancel sign-in, then try again. This return link expires with your sign-in attempt after three minutes. Completing sign-in requires the original app session.</p>
`;
  } catch {
    status = 400;
    content =
      "<h1>Sign-in could not return to InternOS</h1><p>This callback is invalid or incomplete. Return to InternOS, cancel sign-in, and start again.</p>";
  }
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Return to InternOS</title><style>body{font:16px system-ui,sans-serif;color:#16233a;background:radial-gradient(ellipse at top,#dce9fa,#f4f6fa);margin:0;min-height:100vh;display:grid;place-items:center}main{margin:24px;padding:32px;max-width:480px;background:#ffffffad;border:1px solid #fff;border-radius:24px;box-shadow:0 20px 60px #314d6b18;backdrop-filter:blur(24px)}h1{font-size:26px}p{line-height:1.6}a{display:block;padding:14px;margin:12px 0;border:1px solid #c5d3e6;border-radius:14px;color:#25487e;text-decoration:none;background:#ffffff99}a:focus-visible,summary:focus-visible{outline:3px solid #4479c5}summary{cursor:pointer}</style></head><body><main>${content}</main></body></html>`,
    { status, headers },
  );
}
