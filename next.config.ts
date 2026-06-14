import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // jsPDF optionally imports html2canvas for its .html() method, which we
      // never use. Point it at an empty stub so Turbopack can resolve the
      // module without requiring the real package.
      html2canvas: "./stubs/html2canvas.js",
    },
  },
};

export default nextConfig;
