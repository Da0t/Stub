import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone",
  // Native Skia binding must be loaded by Node in the strip route (path 7),
  // not parsed by the bundler.
  serverExternalPackages: ['@napi-rs/canvas'],
  // Keep builds deterministic on constrained CI hosts (paths 4 and 8).
  experimental: { cpus: 1 },
};

export default nextConfig;
