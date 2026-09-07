/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  webpack: (config) => {
    // pdfjs-dist ships a worker file that webpack needs to treat as an asset,
    // not bundle through the normal JS pipeline.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false, // pdfjs-dist's node canvas fallback isn't needed in-browser
    };
    return config;
  },
};

module.exports = nextConfig;
