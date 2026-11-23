/**
 * Pre-commit checks (run by .husky/pre-commit via `npx lint-staged`).
 *
 * - ESLint only on staged files.
 * - tsc on the whole project: type errors can surface in files that were not touched.
 * - Vitest only on tests related to the staged files (import graph), with the
 *   --experimental-sqlite flag that `npm run test:related` already sets.
 */
const code = "**/*.{ts,tsx,js,jsx,mjs,cjs}";

export default {
  [code]: (files) => {
    const quoted = files.map((f) => JSON.stringify(f)).join(" ");
    return [
      `eslint --no-warn-ignored ${quoted}`,
      "npm run typecheck",
      `npm run test:related -- ${quoted}`
    ];
  }
};
