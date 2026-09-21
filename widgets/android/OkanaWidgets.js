import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { formatCurrency } from '../../utils/format'
import { WIDGET_DAYS } from '../../utils/widgetSnapshot'

// The Android home screen widgets. They are drawn from JS (react-native-android-widget
// turns these into native RemoteViews), so they can only use its own primitives —
// FlexWidget, TextWidget, SvgWidget — not React Native's. The iOS versions live in
// targets/widget and are written separately in SwiftUI; the design is the same.
//
// `snap` is always a resolved snapshot (see resolveWidgetSnapshot) or null.

const BG = '#161616'
const TRACK = '#2a2a2a'
const MUTED = '#8a8a8a'
const TEXT = '#ffffff'
const GREEN = '#4ade80'
const RED = '#f87171'
const BAR = '#4a4a4a'
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

// A rounded progress bar as a tiny SVG — a plain view can't take a percentage width.
function Bar({ width, percent, color, height = 6 }) {
  const w = Math.max(20, Math.round(width))
  const fill = Math.round((w * Math.min(100, Math.max(0, percent))) / 100)
  const r = height / 2
  return (
    <SvgWidget
      style={{ width: w, height }}
      svg={`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}"><rect width="${w}" height="${height}" rx="${r}" fill="${TRACK}"/>${fill > 0 ? `<rect width="${Math.max(fill, height)}" height="${height}" rx="${r}" fill="${color}"/>` : ''}</svg>`}
    />
  )
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

// Small: this month's spend against the budget.
export function MonthSpendWidget({ snap, info }) {
  if (!snap) return <SignedOut />
  const { spent, budget } = snap
  const percent = budget ? (spent / budget) * 100 : 0
  return (
    <Shell>
      <Label text={`Spent in ${snap.monthLabel}`} />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <Label text={money(spent)} color={TEXT} size={26} weight="500" />
        <Label text={budget ? `of ${money(budget)}` : 'No budget set'} />
      </FlexWidget>
      {budget
        ? <Bar width={info.width - PAD * 2} percent={percent} color={percent >= 100 ? RED : '#e5e5e5'} />
        : <Label text=" " />}
    </Shell>
  )
}

// Medium: spend per day over the last 30 days, today in red.
export function DailyChartWidget({ snap, info }) {
  if (!snap) return <SignedOut />
  const { days } = snap
  const total = days.reduce((a, b) => a + b, 0)
  const w = Math.max(120, Math.round(info.width - PAD * 2))
  const h = Math.max(36, Math.round(info.height - PAD * 2 - 42))
  const max = Math.max(...days, 1)
  const slot = w / WIDGET_DAYS
  const barW = Math.max(2, slot * 0.66)
  const bars = days.map((amt, i) => {
    const bh = amt > 0 ? Math.max(3, Math.round((amt / max) * h)) : 2
    const x = (i * slot + (slot - barW) / 2).toFixed(1)
    const fill = i === WIDGET_DAYS - 1 ? RED : amt > 0 ? BAR : TRACK
    return `<rect x="${x}" y="${h - bh}" width="${barW.toFixed(1)}" height="${bh}" rx="${Math.min(2, barW / 2)}" fill="${fill}"/>`
  }).join('')
  return (
    <Shell>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <Label text="Last 30 days" />
          <Label text={money(total)} color={TEXT} size={22} weight="500" />
        </FlexWidget>
        <Label text={`${money(total / WIDGET_DAYS)} / day`} />
      </FlexWidget>
      <SvgWidget
        style={{ width: w, height: h }}
        svg={`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`}
      />
    </Shell>
  )
}

// Small: the goal closest to done.
export function GoalWidget({ snap, info }) {
  if (!snap) return <SignedOut />
  const goal = snap.goals[0]
  if (!goal) {
    return (
      <Shell>
        <Label text="Savings" />
        <Label text="No goals yet" color={TEXT} size={16} weight="500" />
        <Label text="Add one in Okana" />
      </Shell>
    )
  }
  const percent = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0
  return (
    <Shell>
      <Label text={goal.name} />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <Label text={`${percent}%`} color={TEXT} size={26} weight="500" />
        <Label text={`${money(goal.saved)} of ${money(goal.target)}`} />
      </FlexWidget>
      <Bar width={info.width - PAD * 2} percent={percent} color={GREEN} />
    </Shell>
  )
}

// Medium and up: every active goal that fits, closest to done first.
const GOAL_ROW = 36
const GOALS_HEADER = 22

export function GoalsWidget({ snap, info }) {
  if (!snap) return <SignedOut />
  const { goals } = snap
  if (!goals.length) {
    return (
      <Shell>
        <Label text="Savings goals" />
        <Label text="No goals yet" color={TEXT} size={16} weight="500" />
        <Label text="Add one in Okana" />
      </Shell>
    )
  }
  const fit = Math.max(1, Math.floor((info.height - PAD * 2 - GOALS_HEADER) / GOAL_ROW))
  const shown = goals.slice(0, fit)
  const barWidth = info.width - PAD * 2
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: PAD, flexDirection: 'column' }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent', height: GOALS_HEADER }}>
        <Label text="Savings goals" />
        <Label text={goals.length > shown.length ? `+${goals.length - shown.length} more` : `${goals.length} active`} />
      </FlexWidget>
      {shown.map((g, i) => {
        const percent = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0
        return (
          <FlexWidget key={i} style={{ flexDirection: 'column', width: 'match_parent', height: GOAL_ROW, justifyContent: 'center' }}>
            <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent', marginBottom: 4 }}>
              <FlexWidget style={{ flex: 1 }}><Label text={g.name} color={TEXT} size={13} /></FlexWidget>
              <Label text={`${money(g.saved)} · ${percent}%`} size={12} />
            </FlexWidget>
            <Bar width={barWidth} percent={percent} color={GREEN} height={5} />
          </FlexWidget>
        )
      })}
    </FlexWidget>
  )
}

export const WIDGETS = {
  OkanaMonthSpend: MonthSpendWidget,
  OkanaDailyChart: DailyChartWidget,
  OkanaGoal: GoalWidget,
  OkanaGoals: GoalsWidget,
}
