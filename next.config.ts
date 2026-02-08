import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@browserbasehq/sdk', '@browserbasehq/stagehand', 'composio-core'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@neondatabase/auth']
  }
};

export default nextConfig;
