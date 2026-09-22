import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mongoose must stay outside the bundler so its dynamic driver requires work.
  serverExternalPackages: ["mongoose", "bcrypt-ts", "nodemailer", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/admin/presentations/import": [
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
  },
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
