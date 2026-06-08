import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // enables minimal Docker image via Dockerfile.nextjs
  experimental: {
    scrollRestoration: false,
  },
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
