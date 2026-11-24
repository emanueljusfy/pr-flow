import type { NextConfig } from "next";
import { LEGACY_DEVTOOLS_REDIRECTS } from "./modules/settings/lib/legacy-redirects";

const nextConfig: NextConfig = {
  output: "standalone",
  // The whiteboard server (modules/whiteboard/lib) runs tldraw's store headless; bundled for
  // route handlers it resolves React's server build, which has no createContext.
  serverExternalPackages: ["tldraw", "@tldraw/editor"],
  async redirects() {
    return LEGACY_DEVTOOLS_REDIRECTS.map((entry) => ({ ...entry, permanent: false }));
  }
};

export default nextConfig;
