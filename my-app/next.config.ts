import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/reviews/scrape": [
      "./node_modules/playwright-core/.local-browsers/**/*",
      "./node_modules/playwright/.local-browsers/**/*",
    ],
  },
};

export default nextConfig;
