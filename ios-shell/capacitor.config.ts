import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.internos.mobile",
  appName: "InternOS",
  webDir: "www",
  loggingBehavior: "none",
  server: {
    url: "https://internos-green.vercel.app",
    cleartext: false,
    errorPath: "index.html",
  },
  ios: { contentInset: "automatic", loggingBehavior: "none" },
  // Native HTTP/cookie patching would bypass WKWebView's normal same-origin Set-Cookie handling.
  plugins: {
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
};
export default config;
