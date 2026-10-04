// The app's type system (the sizes themselves are FONT, below).
//
// No `fontFamily` anywhere: every screen uses the platform's own UI face
// (SF Pro on iOS, Roboto on Android). The headline figures used to be set
// in `ui-rounded`, which reads friendly where this app wants quiet, and
// meant two families were on screen at once.

// Figures only. Proportional digits are each a different width, so an
// amount counting up visibly jitters as its digits swap — tabular ones are
// fixed-width, which is the difference between a number settling and a
// number wobbling. Spread onto any Text that shows money.
export const TABULAR = { fontVariant: ['tabular-nums'] };

// The app's whole type scale, in one place. Every font size in the app is one of
// these six — nothing is typed in by hand. Anything that doesn't fit one of them
// is usually trying to be a seventh thing it doesn't need to be.
//
//   label    11  uppercase section labels, chips, the smallest print
//   caption  13  anything explaining something else: dates, hints, the period
//                under an amount. Always paired with a muted colour.
//   body     16  row labels, descriptions, buttons — most text in the app
//   title    20  a screen's or sheet's own title
//   amount   24  a card's figure
//   display  44  the one big headline figure on a screen (light weight, TABULAR)
//
// Not covered by the scale, on purpose: emoji used as icons, the one-off
// day-over-month date chip, the amount-entry digits (AmountField, which shrink to
// fit) and text drawn inside SVG charts.
export const FONT = { label: 11, caption: 13, body: 16, title: 20, amount: 24, display: 44 };

// Row labels, descriptions, buttons — most text in the app. Apple's own
// Dynamic Type "Body" is 17/22, which read too large once actually on
// screen; plain 15 read too small right after that. 16 is the middle
// landed on between the two, picked on screen rather than off a metric.
export const BODY = { fontSize: FONT.body, lineHeight: 21, fontWeight: '400' };

// Anything explaining something else: dates under a description, the
// period under an amount, a hint. Always paired with a muted colour.
export const CAPTION = { fontSize: FONT.caption, fontWeight: '400' };
