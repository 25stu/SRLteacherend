import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracing: false, // 禁用文件追踪以避免 Windows 下 node: 协议导致的非法文件名错误
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
