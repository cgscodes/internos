import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppearanceProvider } from "@/components/design/appearance";
import { appearanceBootScript } from "@/lib/appearance";
import { ViewportObserver } from "@/components/design/viewport";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#101824" },
  ],
};

export const metadata: Metadata = {
  title: "InternOS — Your next chapter",
  description:
    "A thoughtful workspace for your internship search. Discover opportunities, track applications, and keep moving forward.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} />
      </head>
      <body>
        <AppearanceProvider>
          <ViewportObserver />
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}
