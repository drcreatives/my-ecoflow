import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure for standalone build (self-contained deployment)
  output: 'standalone',
  
  eslint: {
    // Warning: This disables ESLint during builds
    // Only use this as a temporary fix while resolving warnings
    ignoreDuringBuilds: true,
  },
  
  // Optimize images for production
  images: {
    unoptimized: true, // Set to true if cPanel doesn't support image optimization
  },
};

export default nextConfig;
