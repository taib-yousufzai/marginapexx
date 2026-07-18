import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // enables minimal Docker image via Dockerfile.nextjs
  experimental: {
    scrollRestoration: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/charting_library/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
