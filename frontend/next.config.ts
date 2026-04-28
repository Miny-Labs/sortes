import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow importing the parent SDK and ABIs.
    externalDir: true,
  },
  webpack: (config) => {
    // Polyfills for some web3 libs.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
