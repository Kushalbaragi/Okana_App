// The app's spacing rhythm. Everything is a multiple of 4, and the only
// decision most of the time is "is this the same group or a different one".
//
// The rule that matters: keep space WITHIN a group tight and space BETWEEN
// groups generous. An amount and the caption explaining it are one thing
// and sit close; the amount and the chart below it are two things and want
// real air. Uniform spacing everywhere is what makes a screen read as dense
// even when nothing on it is crowded.

// Screen edge to content — the same on every screen and at every depth, so
// the header icons, the headline and the row text all share one left edge.
// Rows inside a list carry no horizontal padding of their own any more:
// the list holds the gutter, since there's no card between them to inset
// against. The only value here worth a real export: it shows up in raw
// style objects (ScrollView contentContainerStyle, absolute positioning)
// that can't reach for a Tailwind class the way everything below can.
export const GUTTER = 20;

// The transaction ledger's month-pill has its own inset, on top of GUTTER —
// shared here (rather than one file exporting it to the other) so
// TransactionList's pill and TransactionItem's row can each import it
// without depending on each other: a row's text lines up under the pill's
// own text above it instead of starting further left at the raw list edge.
export const LEDGER_PILL_INSET = 14;

// The two vertical rhythms, as Tailwind classes rather than exports — every
// site setting one is already in className, so a JS constant would just be
// a value nothing imports:
//
//   Tight (8)     gap-2, mb-2, mt-2 — a thing and its own caption
//   Section (32)  mb-8, pb-8        — the boundary between two groups
//
// Keep new spacing decisions on this same scale (4, 8, 12, ... 32) rather
// than picking a number that feels right in the moment.
