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
// Three levels for anything meant to be READ, and one for controls that
// are merely present (an unselected range word, a disabled button). The
// split matters: the first three all have to clear a contrast floor
// because someone is reading them; the fourth is an affordance, and
// deliberately recedes.
export const darkText = {
  // Headline amounts, primary labels. Full contrast — a headline figure
  // held back to 92% reads as slightly dusty against true black.
  primary: 'rgba(255,255,255,0.98)',
  // Body text that isn't the primary focus but still needs to be read
  // comfortably (e.g. row subtitles, section descriptions).
  secondary: 'rgba(255,255,255,0.6)',
  // De-emphasized but still normal-sized text — the WCAG normal-text floor,
  // with a small buffer above the 0.455 minimum.
  tertiary: 'rgba(255,255,255,0.47)',
  // NOT a text level: inactive and disabled controls only. Below the
  // normal-text contrast minimum, so nothing anyone has to read may use it.
  disabled: 'rgba(255,255,255,0.3)',
};

// Mirror set for the light-background variant (`#FAFAF8`), same reasoning
// with black text instead of white. Solving the same contrast formula for
// black-on-`#FAFAF8` gives very similar target opacities to the dark set.
export const lightText = {
  primary: 'rgba(0,0,0,0.92)',
  secondary: 'rgba(0,0,0,0.6)',
  tertiary: 'rgba(0,0,0,0.47)',
  disabled: 'rgba(0,0,0,0.3)',
};

// Convenience: pick the right set from the same `light` boolean prop
// components already thread through (see SummaryCard/Header).
export function textColor(light) {
  return light ? lightText : darkText;
}

// ---------------------------------------------------------------------------
// The two data colours, and the only colours the app uses to mean anything.
// Red is money leaving, green is money arriving; everything else on screen is
// neutral. That's the whole rule — a colour anywhere means money moved, so
// nothing is ever tinted for decoration.
//
// The red is #ef4444 lifted about 10% per channel (red clamped at 255): at
// these alphas the original sat a touch dark against pure black. It is NOT
// the danger red used on destructive UI (248,113,113) or the delete button's
// systemRed — those are button states rather than data, and stay separate.
//
// Success and confirmation greens elsewhere in the app (SuccessBadge,
// Celebration, PaymentProcessing) deliberately do NOT come from here: they
// mean "that worked", not "income", and share a hex by coincidence.
// ---------------------------------------------------------------------------
// The same two hues as solid hex, for the places that supply their own
// opacity separately (SVG gradient stops take a colour and a stopOpacity —
// handing those an rgba would multiply the two alphas together).
export const EXPENSE_HEX = '#FF4B4B';
export const INCOME_HEX = '#4ade80';

export const EXPENSE = 'rgba(255,75,75,0.92)';
// The same red with the weight taken out, for a series that isn't the one
// being read right now.
export const EXPENSE_DIM = 'rgba(255,75,75,0.56)';
export const INCOME = 'rgba(74,222,128,0.95)';
export const INCOME_DIM = 'rgba(74,222,128,0.62)';
// Income at reading weight rather than chart weight — slightly held back so
// a green amount in a list doesn't glow next to white text beside it.
export const INCOME_TEXT = 'rgba(74,222,128,0.8)';
