import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  devIndicators: false,
  // Preserve PDF.js native worker resolution for private server-side resume extraction.
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/ai/match": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  logging: { incomingRequests: { ignore: [/\/auth\//] } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
