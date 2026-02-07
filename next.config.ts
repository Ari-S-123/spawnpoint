import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@browserbasehq/sdk', '@browserbasehq/stagehand'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@neondatabase/auth']
  }
};

export default nextConfig;
