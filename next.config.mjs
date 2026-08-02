/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep hackathon/CI builds deterministic on constrained hosts. Next's default
  // process-worker fan-out deadlocks under the shared Windows Node 24 runner.
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    workerThreads: false,
  },
};

export default nextConfig;
