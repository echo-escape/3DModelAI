import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许加载腾讯云相关的远程图片资源
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.myqcloud.com",
      },
      {
        protocol: "https",
        hostname: "**.tencentcloudapi.com",
      },
    ],
  },
  // 确保 3D 相关的库在 Next.js 中正确转译
  transpilePackages: ["three", "three-stdlib", "@google/model-viewer"],
};

export default nextConfig;
