import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: [
    '@ams-content-factory/config',
    '@ams-content-factory/core',
    '@ams-content-factory/db',
  ],
};

export default nextConfig;
