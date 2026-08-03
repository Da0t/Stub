import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Wrapped for the Weekend",
  description: "Your festival, remembered.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Capture",
  },
};

export const viewport: Viewport = {
  // viewport-fit=cover exposes the safe-area insets the shutter padding uses.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <AppShell>{children}</AppShell>
        {/*
          Service worker registration. Kept as an inline script rather than a
          separate client component so app shell + grid caching are live before
          any React hydrates — the app must boot to a viewfinder with the
          network off. Registration failure is swallowed (offline is normal).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
