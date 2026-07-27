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
