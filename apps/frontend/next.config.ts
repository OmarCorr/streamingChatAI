import type { NextConfig } from 'next';

const config: NextConfig = {
  // ADR-11: standalone output produces a minimal server.js + node_modules subset
  // for the Docker runtime stage — avoids shipping all of node_modules in the image.
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

export default config;
