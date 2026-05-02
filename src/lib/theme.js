export const DEFAULT_SANS_FONT = "'Syne', sans-serif";
export const DEFAULT_MONO_FONT = "'DM Mono', monospace";

export function cssVar(name, fallback = '') {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function appFonts() {
  return {
    sans: cssVar('--sans', DEFAULT_SANS_FONT),
    mono: cssVar('--mono', DEFAULT_MONO_FONT),
  };
}
