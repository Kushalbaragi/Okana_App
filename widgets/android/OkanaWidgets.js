import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { formatCurrency } from '../../utils/format'

// The Android home screen widgets. They are drawn from JS (react-native-android-widget
// turns these into native RemoteViews), so they can only use its own primitives —
// FlexWidget, TextWidget, SvgWidget — not React Native's. The iOS versions live in
// targets/widget and are written separately in SwiftUI; the design is the same.
//
// `snap` is always a resolved snapshot (see resolveWidgetSnapshot) or null.

const BG = '#000000'
const TRACK = '#2a2a2a'
const MUTED = '#8a8a8a'
const TEXT = '#ffffff'
const GREEN = '#4ade80'
const RED = '#f87171'
const PAD = 14

const money = (n) => formatCurrency(Math.round(n))

function Shell({ children }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 22,
        padding: PAD,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {children}
    </FlexWidget>
  )
}

function Label({ text, color = MUTED, size = 11, weight = 'normal', align }) {
  return <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: size, color, fontWeight: weight, textAlign: align }} />
}

function SignedOut() {
  return (
    <Shell>
      <Label text="Okana" />
      <Label text="Open Okana to see your numbers here" color={TEXT} size={14} />
      <Label text=" " />
    </Shell>
  )
}

// Medium: this month's total, how it compares with all of last month, and a
// candle for every day so far — the same design as the iOS one (targets/widget/
// Views.swift). Heights follow a square root, like the app's own month chart, with
// a floor, so a small day still shows next to a big one.
const CANDLE_GAP = 3
const CANDLE_FLOOR = 0.12
// "This month" and the change, dimmed so the total stands out. RemoteViews text has
// no opacity, so it is baked into the colour's alpha.
const LABEL_ALPHA = 'BF' // 75%
const dim = (hex) => `#${LABEL_ALPHA}${hex.slice(1)}`

// This month against all of last month, in whole percent; null (no label) with no
// spend last month to compare against, or no difference.
function monthChange({ spent, lastMonthSpent }) {
  if (!lastMonthSpent || lastMonthSpent <= 0) return null
  const change = Math.round(((spent - lastMonthSpent) / lastMonthSpent) * 100)
  return change === 0 ? null : change
}

function DailyChartWidget({ snap, info }) {
  if (!snap) return <SignedOut />
  const { month, today } = snap
  const change = monthChange(snap)
  const w = Math.max(120, Math.round(info.width - PAD * 2))
  // Below the header (three short lines, two without a change to show) and its 8
  // gap, the chart takes the rest.
  const h = Math.max(30, Math.round(info.height - PAD * 2 - (change == null ? 36 : 50) - 8))
  const peak = Math.max(...month, 1)
  const slot = w / month.length
  const barW = Math.max(2, slot - CANDLE_GAP)
  const marks = month.map((amt, i) => {
    const cx = i * slot + slot / 2
    if (i < today && amt > 0) {
      const bh = Math.round(h * Math.max(CANDLE_FLOOR, Math.sqrt(amt / peak)))
      return `<rect x="${(cx - barW / 2).toFixed(1)}" y="${h - bh}" width="${barW.toFixed(1)}" height="${bh}" rx="${Math.min(2, barW / 2)}" fill="${RED}"/>`
    }
    const r = i < today ? 2.5 : 2
    return `<circle cx="${cx.toFixed(1)}" cy="${h - r}" r="${r}" fill="${i < today ? GREEN : TRACK}"/>`
  }).join('')
  return (
    <Shell>
      {/* "This month", the total and the change, centred one below the other, the
          labels small and dimmed so the total stands out and the candles get the height. */}
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center', width: 'match_parent' }}>
        <Label text="This month" color={dim(MUTED)} size={9} />
        <FlexWidget style={{ marginTop: 3, marginBottom: 3 }}>
          <Label text={money(snap.spent)} color={TEXT} size={18} weight="500" />
        </FlexWidget>
        {change != null && <Label text={`${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%`} color={dim(change > 0 ? RED : GREEN)} size={9} weight="500" />}
      </FlexWidget>
      <SvgWidget
        style={{ width: w, height: h, marginTop: 8 }}
        svg={`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${marks}</svg>`}
      />
    </Shell>
  )
}

export const WIDGETS = {
  OkanaDailyChart: DailyChartWidget,
}
