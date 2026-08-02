/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid process-worker deadlocks on constrained Windows/CI hosts.
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    workerThreads: false,
  },
};

export default nextConfig;
