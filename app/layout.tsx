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
      
      <body
      >
         <AuthProvider>
          {children}
          <Script async src="https://scripts.simpleanalyticscdn.com/latest.js" />

        </AuthProvider>
      </body>
    </html>
  );
}
