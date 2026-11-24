import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// jsdom has no CSS.supports; tldraw reads it when its module loads.
if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", { writable: true, value: {} });
}
if (typeof globalThis.CSS.supports !== "function") {
  globalThis.CSS.supports = () => false;
}
