import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // enables minimal Docker image via Dockerfile.nextjs
  experimental: {
    scrollRestoration: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
