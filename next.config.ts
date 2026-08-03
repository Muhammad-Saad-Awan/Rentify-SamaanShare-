import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Image optimization configuration
  images: {
    // Cloudinary will be added here when configured
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      // Demo seed data only (prisma/seed-demo.ts). Listing cards render through
      // next/image, which refuses any host not listed here, so demo listings
      // would show broken images without it. Remove this entry - and the demo
      // data - before launch: real uploads go to Cloudinary above.
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },

  // Experimental features
  experimental: {
    // Enable server actions (enabled by default in Next.js 15)
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
