/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import Script from "next/script";


export const metadata: Metadata = {
  title: "BlueSky Composer - Notes app for BlueSky users",
  description:
    "Browser-based desktop app for BlueSky users to draft, organize, and post long-form threads with less friction.",
  keywords: [
    "BlueSky",
    "notes app",
    "composer",
    "desktop",
    "thread",
    "posting",
    "pro",
    "encrypted",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Script data-collect-dnt="true" async src="https://scripts.simpleanalyticscdn.com/latest.js" />
        </AuthProvider>
      </body>
    </html>
  );
}
