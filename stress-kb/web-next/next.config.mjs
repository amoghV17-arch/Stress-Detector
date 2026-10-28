import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@core': path.resolve(__dirname, '../web/js/core'),
      '@sim': path.resolve(__dirname, '../web/sim'),
    };
    return config;
  },
};

export default nextConfig;
