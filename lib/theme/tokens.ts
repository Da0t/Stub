// Design-system tokens — Artist Desk ("cream field guide") promoted app-wide.
// Source of truth: SPEC.md §2. Do not invent new values here; extend SPEC.md first.

export const palette = {
  forest: "#173f35",
  deepForest: "#0b2925",
  cream: "#f2e6c8",
  kraft: "#b98f59",
  ink: "#221b16",
  orange: "#d35c32",
  gold: "#d9aa4f",
  fog: "#dce5df",
  sky: "#75939a",
  disco: "#d8e8eb",
  white: "#fffdf7",
} as const;

export const fonts = {
  display: 'Georgia, "Times New Roman", serif',
  sans: "Arial, Helvetica, sans-serif",
  hand: '"Comic Sans MS", "Segoe Print", cursive',
} as const;

// One mode only — the cream field guide. No dark-mode split to maintain.
export const theme = {
  paper: "#eee3c3",
  panel: "#f5edda",
  ink: "#17352f",
  accent: "#d96842",
  alt: "#e8cc83",
  desk: "#e4d9b5",
  shadowInk: "#17352f",
} as const;
