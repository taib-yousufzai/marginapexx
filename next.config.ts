import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // enables minimal Docker image via Dockerfile.nextjs
  experimental: {
    scrollRestoration: false,
    workerThreads: false,
    cpus: 4,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
