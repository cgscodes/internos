const dashboardPaths = [
  "/",
  "/discover",
  "/applications",
  "/resumes",
  "/settings",
];

export function isDashboardPath(pathname: string) {
  return dashboardPaths.some((path) =>
    path === "/"
      ? pathname === "/"
      : pathname === path || pathname.startsWith(`${path}/`),
  );
}

/** Only local dashboard destinations are accepted, never auth endpoints or arbitrary URLs. */
export function safeNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded))
      return "/";
    const destination = new URL(value, "https://internos.invalid");
    if (
      destination.origin !== "https://internos.invalid" ||
      !isDashboardPath(destination.pathname)
    )
      return "/";
    return destination.pathname + destination.search;
  } catch {
    return "/";
  }
}

export function loginPath(next: string = "/", error?: string) {
  const query = new URLSearchParams();
  const destination = safeNext(next);
  if (destination !== "/") query.set("next", destination);
  if (error) query.set("error", error);
  return `/login${query.size ? `?${query}` : ""}`;
}
