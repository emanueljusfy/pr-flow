import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Existing components still violate these React Compiler rules (~40 sites).
    // Kept as warnings so they show up without blocking commits; promote to
    // "error" once the backlog is cleared.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn"
    }
  },
  globalIgnores([".next/**", "out/**", "build/**", "data/**", "coverage/**", "next-env.d.ts"])
]);
