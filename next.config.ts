import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker standalone 模式仅在 CI/Linux 环境启用
  // Windows 下 symlink 权限问题会导致 build trace 失败
  output: process.env.CI ? "standalone" : undefined,

  // 实验性功能
  experimental: {
    // React 19 的 reactCompiler 暂不开（构建性能影响）
    // ppr: true,  // Partial Prerendering 留到后期
  },

  // 图片优化（如果有外部链接的图片）
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.cc98.org",
      },
    ],
    unoptimized: process.env.NODE_ENV === "development",
  },

  // 安全头
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],

  // 日志中隐藏敏感路径
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
