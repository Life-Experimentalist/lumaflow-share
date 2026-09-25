import type { NextConfig } from "next";

// Static export for GitHub Pages (served at share.lumaflow.in, so no basePath).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
