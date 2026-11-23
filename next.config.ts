import type { NextConfig } from "next";
import { LEGACY_DEVTOOLS_REDIRECTS } from "./modules/settings/lib/legacy-redirects";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return LEGACY_DEVTOOLS_REDIRECTS.map((entry) => ({ ...entry, permanent: false }));
  }
};

export default nextConfig;
