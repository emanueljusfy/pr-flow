/**
 * Old `/devtools/*` routes now live as tabs under `/settings`.
 * Kept free of `@/` imports because `next.config.ts` loads it.
 */
export const LEGACY_DEVTOOLS_REDIRECTS = [
  { source: "/devtools/crons", destination: "/settings/crons" },
  { source: "/devtools/repositories", destination: "/settings/repositories" },
  { source: "/devtools/local-docker", destination: "/settings/local-docker" }
] as const;
