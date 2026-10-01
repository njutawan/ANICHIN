import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Detect Vercel deployment (Vercel sets VERCEL=1 env var automatically)
const isVercel = process.env.VERCEL === "1";
// Detect Docker/standalone target (set via build arg or env)
const isStandalone = !isVercel && process.env.DEPLOY_TARGET === "standalone";

const nextConfig: NextConfig = {
  // Only use "standalone" output for Docker deployment.
  // Vercel has native Next.js support — standalone output would actually break Vercel deploys.
  ...(isStandalone ? { output: "standalone" as const } : {}),
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  
  // Performance: optimize package imports (tree-shake large libs)
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-sheet',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
    ],
  },
  
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    minimumCacheTTL: 3600,
    // Performance: reduce device sizes (smaller images)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default withBundleAnalyzer(nextConfig);
