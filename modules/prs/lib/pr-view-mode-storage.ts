import { z } from "zod";

export const PR_VIEW_MODE_STORAGE_KEY = "pr-flow:prs-view-mode";

export const prViewModeSchema = z.enum(["cards", "compact"]);

export type PrViewMode = z.infer<typeof prViewModeSchema>;

export const DEFAULT_PR_VIEW_MODE: PrViewMode = "cards";

export function loadPrViewMode(): PrViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_PR_VIEW_MODE;
  }

  try {
    const parsed = prViewModeSchema.safeParse(window.localStorage.getItem(PR_VIEW_MODE_STORAGE_KEY));
    return parsed.success ? parsed.data : DEFAULT_PR_VIEW_MODE;
  } catch {
    return DEFAULT_PR_VIEW_MODE;
  }
}

export function savePrViewMode(mode: PrViewMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PR_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore quota or privacy mode errors.
  }
}
