import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable server-side external packages for transformers.js
  serverExternalPackages: ["onnxruntime-node", "sharp"],

  // Experimental features
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // Configure webpack for better compatibility
  webpack: (config: Record<string, unknown>, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // Don't bundle native modules on server
      const externals = (config.externals as unknown[]) || [];
      externals.push({
        "onnxruntime-node": "commonjs onnxruntime-node",
      });
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
