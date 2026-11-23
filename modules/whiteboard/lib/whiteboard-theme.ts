import { DEFAULT_THEME, type TLTheme, type TLThemes } from "tldraw";

/**
 * PR Flow preset for tldraw: dark palette aligned with app/globals.css tokens
 * (near-black surfaces, hairline borders, ember accent). Canvas/UI chrome colors
 * live in modules/whiteboard/whiteboard.css; keep both in sync.
 */
export const WHITEBOARD_COLORS = {
  surface: "#141414",
  surfaceRaised: "#1a1a1a",
  surfaceInset: "#111111",
  border: "#2a2a2a",
  borderStrong: "#3a3a3a",
  text: "#f2f2f2",
  textMuted: "#8a8a8a",
  brand: "#f07832",
  brandBright: "#ff9a5c",
  brandDim: "rgba(240, 120, 50, 0.12)",
  brandBorder: "rgba(240, 120, 50, 0.36)"
} as const;

const darkDefaults = DEFAULT_THEME.colors.dark;

const dark: TLTheme["colors"]["dark"] = {
  ...darkDefaults,
  text: WHITEBOARD_COLORS.text,
  background: WHITEBOARD_COLORS.surface,
  negativeSpace: WHITEBOARD_COLORS.surface,
  solid: WHITEBOARD_COLORS.surfaceRaised,
  cursor: WHITEBOARD_COLORS.text,
  noteBorder: WHITEBOARD_COLORS.surfaceInset,
  selectionStroke: WHITEBOARD_COLORS.brand,
  selectionFill: WHITEBOARD_COLORS.brandDim,
  selectedContrast: WHITEBOARD_COLORS.text,
  brushFill: "rgba(242, 242, 242, 0.05)",
  brushStroke: "rgba(242, 242, 242, 0.2)",
  snap: WHITEBOARD_COLORS.brandBright,
  laser: WHITEBOARD_COLORS.brand,
  black: {
    ...darkDefaults.black,
    solid: WHITEBOARD_COLORS.text,
    fill: WHITEBOARD_COLORS.text,
    frameHeadingStroke: WHITEBOARD_COLORS.borderStrong,
    frameHeadingFill: WHITEBOARD_COLORS.surfaceRaised,
    frameStroke: WHITEBOARD_COLORS.borderStrong,
    frameFill: WHITEBOARD_COLORS.surfaceInset,
    frameText: WHITEBOARD_COLORS.text,
    noteFill: "#262626",
    noteText: WHITEBOARD_COLORS.text,
    semi: "#222222"
  },
  grey: {
    ...darkDefaults.grey,
    solid: WHITEBOARD_COLORS.textMuted,
    fill: WHITEBOARD_COLORS.textMuted,
    semi: WHITEBOARD_COLORS.border,
    pattern: "#6a6a6a",
    noteFill: WHITEBOARD_COLORS.borderStrong
  },
  orange: {
    ...darkDefaults.orange,
    solid: WHITEBOARD_COLORS.brand,
    fill: WHITEBOARD_COLORS.brand,
    linedFill: WHITEBOARD_COLORS.brandBright,
    semi: "#2b1d14",
    pattern: WHITEBOARD_COLORS.brandBright,
    frameHeadingStroke: WHITEBOARD_COLORS.brand,
    frameHeadingFill: "#2b1d14",
    frameStroke: WHITEBOARD_COLORS.brand,
    frameFill: "#1a120d",
    frameText: WHITEBOARD_COLORS.brandBright,
    noteFill: "#6b3414",
    noteText: WHITEBOARD_COLORS.text
  }
};

export const whiteboardThemes: Partial<TLThemes> = {
  default: {
    ...DEFAULT_THEME,
    colors: {
      light: DEFAULT_THEME.colors.light,
      dark
    }
  }
};

export const WHITEBOARD_PERSISTENCE_KEY = "pr-flow-whiteboard";
