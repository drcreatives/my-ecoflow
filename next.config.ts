import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This disables ESLint during builds
    // Only use this as a temporary fix while resolving warnings
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
