import type { NextConfig } from "next";

// Every page in this app is behind a login and reads live stock data,
// so we use classic dynamic rendering instead of Cache Components.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs"],
  experimental: {
    serverActions: {
      // Excel imports are sent as JSON rows; allow large stock lists.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
