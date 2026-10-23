import type { NextConfig } from "next";

const corsHeaders = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET, POST, PUT, DELETE, OPTIONS",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Authorization, Accept, X-Requested-With",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/chatbot/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        source: "/api/:path*",
        headers: corsHeaders,
      },
    ];
  },
};

export default nextConfig;
