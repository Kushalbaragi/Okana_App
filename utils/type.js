// The app's whole type system. Four sizes and two weights — anything that
// doesn't fit one of these is usually trying to be a fifth thing it doesn't
// need to be.
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

// The two larger steps aren't exported, because the handful of places that
// use them each need to compose the size with something else (the headline
// is absolutely positioned with its own lineHeight; the ruler figure sets
// its own). They're still part of the scale, so keep new ones in step:
//
//   Display  44-48 / weight 300 / letterSpacing -1.75 to -2, always TABULAR
//   Title    20-21 / weight 500 / letterSpacing -0.3
//
// Light weight on the display step is deliberate: at that size weight reads
// as shouting, and the size alone is already doing the work.

// Row labels, descriptions, buttons — most text in the app.
export const BODY = { fontSize: 15, fontWeight: '400' };

// Anything explaining something else: dates under a description, the
// period under an amount, a hint. Always paired with a muted colour.
export const CAPTION = { fontSize: 13, fontWeight: '400' };
