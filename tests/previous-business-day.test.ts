import { describe, expect, it } from "vitest";
import { previousBusinessDay } from "@/modules/journal/lib/notebook-day";

describe("previousBusinessDay", () => {
  it("returns the previous Friday on a Monday", () => {
    expect(previousBusinessDay("2026-06-01")).toBe("2026-05-29");
  });

  it("returns the day before on a weekday", () => {
    expect(previousBusinessDay("2026-05-28")).toBe("2026-05-27");
  });

  it("returns Friday on Saturday and Sunday", () => {
    expect(previousBusinessDay("2026-05-30")).toBe("2026-05-29");
    expect(previousBusinessDay("2026-05-31")).toBe("2026-05-29");
  });
});
