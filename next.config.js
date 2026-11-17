/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["lucide-react"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

module.exports = nextConfig;
