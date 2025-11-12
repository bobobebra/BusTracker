/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable experimental support for ES modules in node_modules.
  experimental: {
    esmExternals: true
  }
};

module.exports = nextConfig;