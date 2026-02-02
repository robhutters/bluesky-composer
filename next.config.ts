import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicit root avoids Turbopack picking /Users/robhutters due to another lockfile there
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.bsky.app",
      },
    ],
  },
};

export default nextConfig;
