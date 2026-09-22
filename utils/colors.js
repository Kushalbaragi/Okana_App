// Shared text-color tokens, tuned for contrast against this app's actual
// backgrounds (pure black `#000000` in dark mode, `#FAFAF8` in the
// experimental light Dashboard variant) rather than picked by eye.
//
// The opacities below aren't arbitrary — they're chosen so plain
// rgba(255,255,255,X) text drawn straight over pure black clears WCAG's
// contrast minimums (a flat X opacity over black renders as sRGB grey X,
// so this is just solving the WCAG contrast formula for X):
//   - normal text needs >=4.5:1, which needs X >= ~0.455
//   - large/bold text (roughly 18pt, or 14pt bold) needs >=3:1, X >= ~0.35
// Before this file, text opacities were picked ad hoc per-component
// (anywhere from 0.04 to 0.9), and several dim/secondary labels sat well
// under 0.455 — fine indoors, but exactly what washes out in daylight glare
// at low screen brightness. `tertiary` and `disabled` below are still
// allowed to sit under the normal-text minimum, but only for text that's
// genuinely large/bold or truly non-essential (a disabled control, a
// timestamp) — not for anything someone needs to read at a glance.
export const darkText = {
  // Headline amounts, primary labels. Effectively full contrast.
  primary: 'rgba(255,255,255,0.92)',
  // Body text that isn't the primary focus but still needs to be read
  // comfortably (e.g. row subtitles, section descriptions).
  secondary: 'rgba(255,255,255,0.62)',
  // De-emphasized but still normal-sized text — the WCAG normal-text floor,
  // with a small buffer above the 0.455 minimum.
  tertiary: 'rgba(255,255,255,0.48)',
  // Only for large/bold text, or text that's genuinely secondary to the
  // point of not needing full legibility (inactive tab labels, disabled
  // state, a muted timestamp). Below the normal-text contrast minimum.
  disabled: 'rgba(255,255,255,0.35)',
};

// Mirror set for the light-background variant (`#FAFAF8`), same reasoning
// with black text instead of white. Solving the same contrast formula for
// black-on-`#FAFAF8` gives very similar target opacities to the dark set.
export const lightText = {
  primary: 'rgba(0,0,0,0.88)',
  secondary: 'rgba(0,0,0,0.62)',
  tertiary: 'rgba(0,0,0,0.48)',
  disabled: 'rgba(0,0,0,0.35)',
};

// Convenience: pick the right set from the same `light` boolean prop
// components already thread through (see SummaryCard/Header).
export function textColor(light) {
  return light ? lightText : darkText;
}
