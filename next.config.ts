import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mongoose must stay outside the bundler so its dynamic driver requires work.
  serverExternalPackages: ["mongoose", "bcrypt-ts", "nodemailer"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
    ],
  },
  experimental: {
    serverActions: {
      // Builder layouts are serialized into hidden form fields and can be large.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
