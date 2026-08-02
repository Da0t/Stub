import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native Skia binding must be loaded by Node in the strip route, not parsed by webpack.
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
