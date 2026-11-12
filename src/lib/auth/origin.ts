/** Use a configured canonical origin behind proxies; never trust forwarded-host redirect input. */
export function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid application origin configuration.");
    return url.origin;
  }
  return new URL(request.url).origin;
}
export function isSameOrigin(request: Request) {
  return request.headers.get("origin") === appOrigin(request);
}
