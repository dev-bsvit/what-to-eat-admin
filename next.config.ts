import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/admin/imagekit/upload": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/sharp/node_modules/@img/**/*",
    ],
  },
};

export default nextConfig;
