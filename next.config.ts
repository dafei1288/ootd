import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 开发环境允许通过 127.0.0.1 访问（Next 16 默认只放行 localhost，
  // 用 127.0.0.1/IP 打开时 HMR 与客户端资源会被当作跨域拦截）
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
