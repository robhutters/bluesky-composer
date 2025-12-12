import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import Script from "next/script";


export const metadata: Metadata = {
  title: "BlueSky Composer - Notes app for BlueSky users",
  description: "A simple notes app for BlueSky users, built with NextJS and Supabase.",
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
      </head>
      <body>
        <AuthProvider>
          {children}
          <Script data-collect-dnt="true" async src="https://scripts.simpleanalyticscdn.com/latest.js" />
          <Script
            defer
            data-website-id="dfid_vcoT0eHxviTmdwOyycC3g"
            data-domain="blueskycomposer.com"
            src="https://datafa.st/js/script.js"
          />
        </AuthProvider>
      </body>
    </html>
  );
}
