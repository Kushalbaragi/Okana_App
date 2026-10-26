import { Fragment } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Line, Path, Circle, Ellipse, Rect, Defs, ClipPath, Text as SvgText } from 'react-native-svg';
import { textColor } from '../utils/colors';
import { FONT, TABULAR } from '../utils/type';

// The pictures on the Insights page, one per insight and learn card (SummarySection picks
// which to draw from `visual.type`). Colour in this app means money moved, so only the
// pictures about money moving use green and red; the rest stay in the text greys.

// A stack of ten coins for an insight about a share of income (the EMI one): the
// share's coins are red, at the bottom, the rest green above them. Drawn beside the
// description rather than under it (see SummarySection), so it is narrow. The one
// picture here in colour, by design: it is about where money goes.
const COIN = { count: 10, w: 70, h: 9, ry: 8, step: 10 };
const COIN_RED = { face: '#f87171', side: '#b23b3b', rim: '#d95555' };
const COIN_GREEN = { face: '#4ade80', side: '#2f9e5b', rim: '#3cc06f' };

export function CoinStack({ percent }) {
  const { count, w, h, ry, step } = COIN;
  const rx = w / 2;
  // At least one red coin for any share at all, and never the whole stack short of 100%.
  const red = percent <= 0 ? 0 : Math.min(percent >= 100 ? count : count - 1, Math.max(1, Math.round(percent / 10)));
  const base = ry + 2 + (count - 1) * step;
  const height = base + h + ry + 2;
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      {Array.from({ length: count }, (_, i) => {
        const c = i < red ? COIN_RED : COIN_GREEN;
        const top = base - i * step;
        return (
          <Fragment key={i}>
            <Path d={`M0 ${top} v${h} a${rx} ${ry} 0 0 0 ${w} 0 v-${h}`} fill={c.side} />
            <Ellipse cx={rx} cy={top} rx={rx} ry={ry} fill={c.face} />
            <Ellipse cx={rx} cy={top} rx={rx - 8} ry={ry - 3} fill="none" stroke={c.rim} strokeWidth={1.2} />
          </Fragment>
        );
      })}
    </Svg>
  );
}

// Two smaller stacks side by side for an insight comparing two months (month_vs_last):
// the bigger month is a full stack, the other in proportion. When this month is the
// bigger one, its coins past last month's height are red — the extra spent.
const PAIR = { count: 10, w: 40, h: 7, ry: 6, step: 8 };

function PairStack({ coins, red, label, amount, t }) {
  const { count, w, h, ry, step } = PAIR;
  const rx = w / 2;
  const base = ry + 2 + (count - 1) * step;
  const height = base + h + ry + 2;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        {Array.from({ length: coins }, (_, i) => {
          const c = i >= coins - red ? COIN_RED : COIN_GREEN;
          const top = base - i * step;
          return (
            <Fragment key={i}>
              <Path d={`M0 ${top} v${h} a${rx} ${ry} 0 0 0 ${w} 0 v-${h}`} fill={c.side} />
              <Ellipse cx={rx} cy={top} rx={rx} ry={ry} fill={c.face} />
            </Fragment>
          );
        })}
      </Svg>
      <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 6 }}>{label}</Text>
      {!!amount && <Text style={{ fontSize: 10, color: t.secondary, marginTop: 2, ...TABULAR }}>{amount}</Text>}
    </View>
  );
}

// With amounts (income_change) each month's figure goes under its label, and `allGreen`
// keeps the bigger month's extra coins green: more income isn't something to warn about.
export function CoinCompare({ prev, cur, prevLabel, curLabel, prevAmount, curAmount, allGreen = false, light = false }) {
  const t = textColor(light);
  const { count } = PAIR;
  const big = Math.max(prev, cur, 1);
  // The smaller month in proportion, never less than one coin.
  const small = Math.max(1, Math.min(count, Math.round((count * Math.min(prev, cur)) / big)));
  const more = cur > prev;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
      <PairStack coins={more ? small : count} red={0} label={prevLabel} amount={prevAmount} t={t} />
      <PairStack coins={more ? count : small} red={more && !allGreen ? count - small : 0} label={curLabel} amount={curAmount} t={t} />
    </View>
  );
}

// The budget as a stack of ten coins for budget_pace. Within budget, the used share is
// red at the bottom and what's left green above it, as in CoinStack. Over budget, the
// whole stack is the budget, and the overspend's coins (one per 10%, up to three)
// spill off the top in red, the third one fallen beside the stack.
const SPILL_ROOM = 2 * COIN.step + 6;
// The spilling coins sit up to 6 to the right and lean, so they need room past the
// stack's edge.
const SPILL_SIDE = 10;
const FALLEN = 26;

export function BudgetCoins({ used }) {
  const { count, w, h, ry, step } = COIN;
  const rx = w / 2;
  const over = used > 100;
  const spill = over ? Math.min(3, Math.max(1, Math.ceil((used - 100) / 10))) : 0;
  const red = over ? 0 : Math.min(count, Math.max(used > 0 ? 1 : 0, Math.round(used / 10)));
  const base = ry + 2 + SPILL_ROOM + (count - 1) * step;
  const height = base + h + ry + 2;
  const width = w + (spill > 0 ? SPILL_SIDE : 0) + (spill > 2 ? FALLEN : 0);
  const coin = (x, top, c, key, transform) => (
    <G key={key} transform={transform}>
      <Path d={`M${x} ${top} v${h} a${rx} ${ry} 0 0 0 ${w} 0 v-${h}`} fill={c.side} />
      <Ellipse cx={x + rx} cy={top} rx={rx} ry={ry} fill={c.face} />
      <Ellipse cx={x + rx} cy={top} rx={rx - 8} ry={ry - 3} fill="none" stroke={c.rim} strokeWidth={1.2} />
    </G>
  );
  const fallenR = 9;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {Array.from({ length: count }, (_, i) => coin(0, base - i * step, i < red ? COIN_RED : COIN_GREEN, `b${i}`))}
      {spill >= 1 && coin(3, base - count * step, COIN_RED, 's1', `rotate(-6 ${rx + 3} ${base - count * step})`)}
      {spill >= 2 && coin(6, base - (count + 1) * step - 1, COIN_RED, 's2', `rotate(8 ${rx + 6} ${base - (count + 1) * step - 1})`)}
      {spill >= 3 && (
        <G>
          <Ellipse cx={w + SPILL_SIDE + FALLEN / 2} cy={base + h + 2} rx={fallenR} ry={fallenR / 3} fill={COIN_RED.side} />
          <Ellipse cx={w + SPILL_SIDE + FALLEN / 2} cy={base + h} rx={fallenR} ry={fallenR / 3} fill={COIN_RED.face} />
        </G>
      )}
    </Svg>
  );
}

// A piggy bank for goal_progress, filled from the bottom to the goal's share. Its
// body is the clip, so the fill takes the pig's shape. With `coin` (goal_almost) one
// more coin hangs above the slot, about to drop in.
const PIG = 'M24 40 q4 -26 40 -26 q34 0 42 24 l8 2 v16 l-8 2 q-4 14 -16 20 v14 h-12 v-10 h-26 v10 h-12 v-16 q-16 -10 -16 -26z';
// The pig's body runs from y 14 (back) to 92 (feet).
const PIG_TOP = 14;
const PIG_BOTTOM = 92;

const COIN_ROOM = 22;

export function PiggyBank({ percent, coin = false, label, light = false }) {
  const t = textColor(light);
  const fill = Math.min(100, Math.max(0, percent)) / 100;
  const y = PIG_BOTTOM - fill * (PIG_BOTTOM - PIG_TOP);
  const top = coin ? -COIN_ROOM : 0;
  return (
    <View style={{ width: 120, alignItems: 'center' }}>
      <Svg width={120} height={96 - top} viewBox={`0 ${top} 120 ${96 - top}`}>
        <Defs>
          <ClipPath id="pig">
            <Path d={PIG} />
          </ClipPath>
        </Defs>
        <Path d={PIG} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
        <Rect x={0} y={y} width={120} height={96 - y} fill={COIN_GREEN.face} opacity={0.9} clipPath="url(#pig)" />
        {/* Coin slot, eye and ear. */}
        <Rect x={54} y={18} width={18} height={4} rx={2} fill="#000" />
        <Circle cx={92} cy={40} r={3} fill="#000" />
        <Path d="M42 18 l-4 -10 l12 6" fill="#3a3a3c" />
        {coin && (
          <G>
            <Circle cx={63} cy={-10} r={8} fill={COIN_GREEN.face} stroke={COIN_GREEN.side} strokeWidth={2} />
            <Line x1={63} y1={-1} x2={63} y2={15} stroke={COIN_GREEN.face} strokeDasharray="2 2" />
          </G>
        )}
      </Svg>
      {/* The goal's name under the pig. */}
      {!!label && <Text numberOfLines={1} style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 6, maxWidth: 120 }}>{label}</Text>}
    </View>
  );
}

// A loan's EMIs as circles for debt_progress: paid ones green with a tick, the rest
// dashed, three to a row. A long loan would be a wall of tiny circles, so past
// TICKS_MAX each circle stands for several EMIs, the paid share kept in proportion.
const TICKS_MAX = 12;
const TICK = 30;

export function EmiTicks({ paid, total }) {
  const circles = Math.min(total, TICKS_MAX);
  const done = total <= TICKS_MAX ? paid : Math.min(circles - 1, Math.max(1, Math.round((paid / total) * circles)));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: TICK * 3 + 8 * 2, gap: 8 }}>
      {Array.from({ length: circles }, (_, i) => (i < done ? (
        <View key={i} style={{ width: TICK, height: TICK, borderRadius: TICK / 2, backgroundColor: COIN_GREEN.face, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path d="M3 7.5 l2.5 2.5 l5.5 -6" fill="none" stroke="#0b3d1f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      ) : (
        <View key={i} style={{ width: TICK, height: TICK, borderRadius: TICK / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5a5a5e' }} />
      )))}
    </View>
  );
}

// Every open loan as a bar for debt_clear_first, by what's left, smallest first: that
// one red and marked "first", the rest grey. Widths follow a square root, so a small
// loan is still a visible bar next to a car loan.
const LOAN_BARS_W = 120;

export function LoanBars({ rows, light = false }) {
  const t = textColor(light);
  const max = Math.max(...rows.map(r => r.remaining), 1);
  return (
    <View style={{ width: LOAN_BARS_W, gap: 8 }}>
      {rows.map((r, i) => {
        const first = i === 0;
        return (
          <View key={i}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 10, color: first ? t.primary : t.tertiary }}>{r.label}</Text>
              {first && <Text style={{ fontSize: 10, color: COIN_RED.face }}>first</Text>}
            </View>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: '#1c1c1e', overflow: 'hidden' }}>
              <View style={{ height: 7, borderRadius: 4, width: `${Math.max(8, Math.sqrt(r.remaining / max) * 100)}%`, backgroundColor: first ? COIN_RED.face : '#5a5a5e' }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// A price tag for loan_cost: the amount borrowed crossed out, the real price (what
// will be repaid in all) in red under it. The tag is drawn; the prices are text on it.
const TAG = { w: 118, h: 104 };
const TAG_PATH = 'M30 10 h76 a6 6 0 0 1 6 6 v72 a6 6 0 0 1 -6 6 h-76 l-24 -42z';

// With `good` (learn_negotiate) the new price is a saving, so it's green, with no
// "real price" line, and the card's label goes under the tag.
export function PriceTag({ was, now, good = false, label, light = false }) {
  const t = textColor(light);
  const tag = (
    <View style={{ width: TAG.w, height: TAG.h }}>
      <Svg width={TAG.w} height={TAG.h} viewBox={`0 0 ${TAG.w} ${TAG.h}`} style={StyleSheet.absoluteFill}>
        <Path d={TAG_PATH} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
        <Circle cx={24} cy={52} r={5} fill="#000" stroke="#3a3a3c" />
      </Svg>
      {/* The tag's body runs from x 30 to 112. */}
      <View style={{ position: 'absolute', left: 32, right: 6, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11, color: t.tertiary, textDecorationLine: 'line-through', ...TABULAR }}>{was}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: good ? 18 : 14, fontWeight: '600', color: good ? COIN_GREEN.face : COIN_RED.face, marginTop: 6, ...TABULAR }}>{now}</Text>
        {!good && <Text style={{ fontSize: 8, color: t.tertiary, marginTop: 3 }}>real price</Text>}
      </View>
    </View>
  );
  if (!label) return tag;
  return (
    <View style={{ alignItems: 'center' }}>
      {tag}
      <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>
    </View>
  );
}

// A balance scale for week_vs_last: last week's pan on the left, this week's on the
// right, the heavier one lower. The tilt grows with the change, up to SCALE_MAX_TILT
// degrees. This week's pan takes the insight's colour; last week's stays grey.
const SCALE = { w: 120, h: 110, px: 60, py: 28, arm: 44, drop: 24 };
const SCALE_MAX_TILT = 12;
// An amount centred under a pan: the pan's bowl ends 10 below the end of its strings.
const PAN_LABEL_W = 64;
const panLabel = (x, y) => ({
  position: 'absolute', left: x - PAN_LABEL_W / 2, top: y + SCALE.drop + 14, width: PAN_LABEL_W,
  textAlign: 'center', fontSize: 10, ...TABULAR,
});

export function BalanceScale({ change, prevLabel, curLabel, light = false }) {
  const t = textColor(light);
  const { w, h, px, py, arm, drop } = SCALE;
  // Positive lifts the right (this week's) end: this week weighed less.
  const tilt = Math.min(SCALE_MAX_TILT, Math.abs(change) * 0.4) * (change < 0 ? 1 : -1) * (Math.PI / 180);
  const lx = px - arm * Math.cos(tilt);
  const ly = py + arm * Math.sin(tilt);
  const rx = px + arm * Math.cos(tilt);
  const ry = py - arm * Math.sin(tilt);
  const thisColor = change < 0 ? COIN_GREEN.face : COIN_RED.face;
  const pan = (x, y, color) => (
    <G>
      <Line x1={x} y1={y} x2={x - 6} y2={y + drop} stroke="#5a5a5e" />
      <Line x1={x} y1={y} x2={x + 6} y2={y + drop} stroke="#5a5a5e" />
      <Path d={`M${x - 12} ${y + drop} h24 q-2 10 -12 10 q-10 0 -12 -10z`} fill={color} />
    </G>
  );
  return (
    <View style={{ width: w }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Line x1={px} y1={py - 8} x2={px} y2={h - 14} stroke="#5a5a5e" strokeWidth={3} />
        <Path d={`M${px - 16} ${h - 10} h32`} stroke="#5a5a5e" strokeWidth={4} strokeLinecap="round" />
        <Line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#8a8a8a" strokeWidth={2.5} />
        <Circle cx={px} cy={py} r={4} fill="#8a8a8a" />
        {pan(lx, ly, '#3a3a3c')}
        {pan(rx, ry, thisColor)}
      </Svg>
      {/* Each week's amount just under its own pan. */}
      <Text style={[panLabel(lx, ly), { color: t.tertiary }]}>{prevLabel}</Text>
      <Text style={[panLabel(rx, ry), { color: thisColor }]}>{curLabel}</Text>
    </View>
  );
}

// A party popper going off, for goal_milestone: the cone in green and confetti
// bursting from its mouth.
const CONFETTI = [
  [60, 30, COIN_GREEN.face], [78, 22, '#ffffff'], [90, 40, COIN_RED.face], [70, 12, COIN_GREEN.face],
  [100, 26, '#ffffff'], [84, 6, COIN_GREEN.face], [104, 50, COIN_GREEN.face], [56, 14, '#ffffff'],
];

export function PartyPopper() {
  return (
    <Svg width={120} height={110} viewBox="0 0 120 110">
      <Path d="M10 104 l26 -60 l34 34z" fill={COIN_GREEN.face} />
      <Path d="M18 86 l8 -18 M28 96 l14 -12" stroke="#0b3d1f" strokeWidth={3} />
      {CONFETTI.map(([x, y, c], i) => (
        <Rect key={i} x={x} y={y} width={7} height={4} rx={1} fill={c} transform={`rotate(${i * 40} ${x} ${y})`} />
      ))}
      <Path d="M54 52 q14 -20 34 -16 M60 60 q24 -8 40 4" fill="none" stroke={COIN_GREEN.face} strokeWidth={2} strokeDasharray="3 3" />
    </Svg>
  );
}

// Fireworks for goal_milestone's 75%: three bursts, each a ring of rays, and the trail
// of the first one rising to it.
const BURSTS = [[44, 40, 22, COIN_GREEN.face], [86, 30, 16, '#e5e5e5'], [78, 70, 12, COIN_GREEN.face]];
const RAYS = 10;

export function Fireworks() {
  return (
    <Svg width={120} height={110} viewBox="0 0 120 110">
      {BURSTS.map(([cx, cy, r, c], b) => Array.from({ length: RAYS }, (_, i) => {
        const a = (i * 2 * Math.PI) / RAYS;
        return (
          <Line
            key={`${b}-${i}`}
            x1={cx + Math.cos(a) * r * 0.35} y1={cy + Math.sin(a) * r * 0.35}
            x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r}
            stroke={c} strokeWidth={2.2} strokeLinecap="round"
          />
        );
      }))}
      <Path d="M44 106 q-2 -30 0 -44" fill="none" stroke="#5a5a5e" strokeDasharray="2 3" />
    </Svg>
  );
}

// Calendar pages for deposit_missed and saving_streak: one per month, ticked green when
// money went in, a missed one red with a dash. Three to a row.
const PAGE_W = 36;
const PAGE_GAP = 6;

export function MonthTicks({ months, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: PAGE_W * 3 + PAGE_GAP * 2, gap: PAGE_GAP }}>
      {months.map((m, i) => (
        <View key={i} style={{ width: PAGE_W, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: m.done ? '#2c2c2e' : COIN_RED.face }}>
          <Text style={{ fontSize: 8, textAlign: 'center', paddingVertical: 2, backgroundColor: m.done ? '#2c2c2e' : COIN_RED.face, color: m.done ? t.tertiary : '#3a0d0d' }}>{m.label}</Text>
          <View style={{ height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' }}>
            {m.done ? (
              <Svg width={14} height={14} viewBox="0 0 14 14">
                <Path d="M3 7.5 l2.5 2.5 l5.5 -6" fill="none" stroke={COIN_GREEN.face} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            ) : (
              <Text style={{ fontSize: 12, color: COIN_RED.face }}>–</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// Bars for lowest_month and the average insights: one slim bar per month (or day),
// with its label under it.
//   highlight  'good' or 'bad' draws the last bar in green or red (lowest_month,
//              above_usual)
//   tone       'expense' or 'income' colours every bar a muted red or green; grey without
//   average    a dashed line across at the average of the values, or at this value
//              when it is a number (above_usual: the usual month, not counting this one)
//   fromZero   bars rise from zero (days, where a day can be nothing: those show as a
//              green dot, as on the home chart); otherwise from three quarters of the
//              lowest, since month totals sit close together and the gap must read
// A few bars are 9 wide; many (a month of days) share the same overall width.
const BARS = { w: 9, gap: 6, h: 84, width: 99, manyGap: 2 };
const BAR_COLORS = { expense: '#783c3c', income: '#326e46' };

export function ValueBars({ values, labels = [], highlight = null, average = false, tone = null, fromZero = false, light = false }) {
  const t = textColor(light);
  const color = BAR_COLORS[tone] || '#46464a';
  const many = values.length > 7;
  const gap = many ? BARS.manyGap : BARS.gap;
  const w = many ? (BARS.width - gap * (values.length - 1)) / values.length : BARS.w;
  const width = many ? BARS.width : values.length * w + (values.length - 1) * gap;
  const floor = fromZero ? 0 : Math.min(...values) * 0.75;
  const range = Math.max(Math.max(...values) - floor, 1);
  const heightOf = (v) => ((v - floor) / range) * BARS.h;
  const last = values.length - 1;
  const lastColor = highlight === 'good' ? COIN_GREEN.face : highlight === 'bad' ? COIN_RED.face : null;
  const avgY = BARS.h - heightOf(typeof average === 'number' ? average : values.reduce((a, b) => a + b, 0) / values.length);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap, height: BARS.h, width }}>
        {values.map((v, i) => (
          v > 0 ? (
            <View key={i} style={{ width: w, height: Math.max(w, heightOf(v)), borderRadius: w / 2, backgroundColor: lastColor && i === last ? lastColor : color }} />
          ) : (
            <View key={i} style={{ width: w, alignItems: 'center' }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COIN_GREEN.face }} />
            </View>
          )
        ))}
        {average && (
          <Svg width={width + 8} height={2} style={{ position: 'absolute', left: -4, top: avgY - 1 }}>
            <Line x1={0} y1={1} x2={width + 8} y2={1} stroke="#ffffff" strokeWidth={1} strokeDasharray="3 3" />
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap, width, marginTop: 6 }}>
        {values.map((_, i) => (
          <View key={i} style={{ width: w, alignItems: 'center', overflow: 'visible' }}>
            {!!labels[i] && <Text numberOfLines={1} style={{ width: 20, textAlign: 'center', fontSize: 10, color: lastColor && i === last ? lastColor : t.tertiary }}>{labels[i]}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

// A salary cut into parts for learn_50_30_20: one bar the width of the page, each part
// as wide as its share, its percent on it and its name under it. Only the saved part is
// green; the rest stay grey, as colour here means money moving.
const SPLIT_GREYS = ['#6e6e72', '#46464a'];

export function SplitBar({ parts, light = false }) {
  const t = textColor(light);
  let grey = 0;
  const colors = parts.map(p => (p.good ? COIN_GREEN.face : SPLIT_GREYS[grey++ % SPLIT_GREYS.length]));
  return (
    <View style={{ width: '100%' }}>
      <Text style={{ fontSize: 11, color: t.tertiary, marginBottom: 8 }}>Salary</Text>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {parts.map((p, i) => (
          <View key={i} style={{ flex: p.pct, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors[i] }}>
            <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: p.good ? '#0b2e17' : '#ffffff', ...TABULAR }}>{p.pct}%</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }}>
        {parts.map((p, i) => (
          <Text key={i} style={{ flex: p.pct, textAlign: 'center', fontSize: 11, color: p.good ? COIN_GREEN.face : t.tertiary }}>{p.label}</Text>
        ))}
      </View>
    </View>
  );
}

// An open safe for savings_withdrawal: the door swung open, a little savings (green)
// still inside, and red coins rolling out across the floor.
const SAFE_LEFT = [[30, 74], [48, 76]];
const SAFE_OUT = [[84, 96], [100, 98], [114, 94]];

export function OpenSafe() {
  return (
    <Svg width={124} height={104} viewBox="0 0 124 104">
      <Rect x={6} y={16} width={70} height={74} rx={6} fill="#2c2c2e" stroke="#3a3a3c" strokeWidth={2} />
      <Rect x={14} y={24} width={54} height={58} rx={3} fill="#000" />
      {SAFE_LEFT.map(([x, y], i) => <Ellipse key={`l${i}`} cx={x} cy={y} rx={9} ry={4} fill={COIN_GREEN.face} />)}
      {/* The door, swung open on the right. */}
      <Path d="M76 20 l26 -8 v80 l-26 -2z" fill="#3a3a3c" />
      <Circle cx={92} cy={52} r={6} fill="none" stroke="#5a5a5e" strokeWidth={2} />
      {SAFE_OUT.map(([x, y], i) => <Ellipse key={`o${i}`} cx={x} cy={y} rx={6} ry={3} fill={COIN_RED.face} />)}
    </Svg>
  );
}

// A wilting plant for goal_idle: a goal that hasn't been watered. All greys, with a
// dashed line where water would fall and a small "no water" note. The goal's name
// sits under it.
export function WiltingPlant({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ width: 110, alignItems: 'center' }}>
      <Svg width={110} height={116} viewBox="0 0 110 116">
        <Path d="M30 86 h50 l-6 26 h-38z" fill="#3a3a3c" />
        <Path d="M55 86 q0 -30 14 -40 q10 -6 12 4" stroke="#6e6e73" strokeWidth={3} fill="none" />
        <Path d="M58 64 q-20 0 -22 14 q16 2 22 -14z" fill="#6e6e73" />
        <Path d="M80 50 q8 10 2 20 q-10 -6 -2 -20z" fill="#6e6e73" />
        <Path d="M30 30 l6 10 M40 22 l2 10" stroke="#3a3a3c" strokeWidth={2} strokeDasharray="2 3" />
        <SvgText x={20} y={20} fill={t.disabled} fontSize={9}>no water</SvgText>
      </Svg>
      {!!label && <Text numberOfLines={1} style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 6, maxWidth: 110 }}>{label}</Text>}
    </View>
  );
}

// A finish arch for debt_free_date: a road narrowing to a green "debt-free" arch, you
// at the start of it. The last loan, the one that sets the date, is named underneath.
export function FinishArch({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ width: 124, alignItems: 'center' }}>
      <Svg width={124} height={104} viewBox="0 0 124 104">
        <Path d="M4 100 L52 40 L72 40 L120 100z" fill="#1c1c1e" />
        <Path d="M62 100 V44" stroke="#3a3a3c" strokeDasharray="5 5" strokeWidth={2} />
        <Path d="M44 46 v-26 a18 18 0 0 1 36 0 v26" fill="none" stroke={COIN_GREEN.face} strokeWidth={5} />
        <Rect x={40} y={8} width={44} height={12} rx={3} fill={COIN_GREEN.face} />
        <SvgText x={62} y={17} textAnchor="middle" fill="#0b3d1f" fontSize={7} fontWeight="700">LOAN-FREE</SvgText>
        <Circle cx={62} cy={92} r={4} fill="#ffffff" />
      </Svg>
      {!!label && <Text numberOfLines={1} style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 6, maxWidth: 124 }}>{label}</Text>}
    </View>
  );
}

// A treasure chest for saved_milestone: the lid tipped open, green coins heaped in the
// mouth. The one picture in brown, since it is wood.
const CHEST_COINS = [[36, 40], [52, 34], [68, 38], [84, 34], [44, 30], [62, 28], [78, 30]];

export function TreasureChest() {
  return (
    <Svg width={120} height={104} viewBox="0 0 120 104">
      <Path d="M14 36 q0 -22 46 -22 q46 0 46 22z" fill="#5a3a1a" transform="rotate(-14 14 36)" />
      {CHEST_COINS.map(([x, y], i) => (
        <G key={i}>
          <Ellipse cx={x} cy={y + 2} rx={9} ry={3.5} fill={COIN_GREEN.side} />
          <Ellipse cx={x} cy={y} rx={9} ry={3.5} fill={COIN_GREEN.face} />
        </G>
      ))}
      <Rect x={14} y={40} width={92} height={56} rx={6} fill="#6b4523" />
      <Rect x={14} y={54} width={92} height={6} fill="#4a2f17" />
      <Rect x={54} y={50} width={12} height={16} rx={2} fill="#e5e5e5" />
    </Svg>
  );
}

// A planner page for set_budget: the month at the top, a promise ("This month I will
// spend ₹ ___") with the usual month pencilled in faintly on the blank, and a pen.
const PLANNER_RINGS = [20, 34, 48, 62, 76, 90];

export function PlannerPage({ heading, hint, light = false }) {
  const t = textColor(light);
  return (
    <Svg width={110} height={116} viewBox="0 0 110 116">
      <Rect x={14} y={8} width={84} height={100} rx={6} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
      {PLANNER_RINGS.map(y => <Circle key={y} cx={14} cy={y} r={3} fill="#000" stroke="#5a5a5e" />)}
      <SvgText x={58} y={28} textAnchor="middle" fill={t.tertiary} fontSize={8} letterSpacing={1}>{heading}</SvgText>
      <Line x1={26} y1={36} x2={90} y2={36} stroke="#3a3a3c" />
      <SvgText x={28} y={54} fill="#e5e5e5" fontSize={9}>This month</SvgText>
      <SvgText x={28} y={67} fill="#e5e5e5" fontSize={9}>I will spend</SvgText>
      <SvgText x={28} y={86} fill="#e5e5e5" fontSize={11} fontWeight="600">₹</SvgText>
      <Line x1={38} y1={88} x2={88} y2={88} stroke="#5a5a5e" strokeDasharray="3 3" />
      {!!hint && <SvgText x={40} y={85} fill="#5a5a5e" fontSize={9}>{hint}</SvgText>}
      <Path d="M92 78 l10 -10 l4 4 l-10 10 l-6 2z" fill="#e5e5e5" />
    </Svg>
  );
}

// A ledger for first_day: a notebook headed TODAY with its first line written in and
// the rest of the page still empty, a pen at the edge. For first_entry, `entry` is the
// user's own first line ({ label, amount }) and `done` puts a green tick on the corner
// in place of the pen.
const LEDGER_BLANKS = [58, 72, 86, 100];

export function Ledger({ entry = { label: 'Tea', amount: '20' }, done = false, light = false }) {
  const t = textColor(light);
  return (
    <Svg width={112} height={116} viewBox="0 0 112 116">
      <Rect x={10} y={8} width={92} height={100} rx={6} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
      <Line x1={72} y1={8} x2={72} y2={108} stroke="#2c2c2e" />
      <SvgText x={18} y={24} fill={t.tertiary} fontSize={7} letterSpacing={1}>TODAY</SvgText>
      <Line x1={14} y1={30} x2={98} y2={30} stroke="#3a3a3c" />
      <SvgText x={18} y={44} fill="#e5e5e5" fontSize={8}>{entry.label.length > 12 ? `${entry.label.slice(0, 11)}…` : entry.label}</SvgText>
      <SvgText x={96} y={44} textAnchor="end" fill={COIN_GREEN.face} fontSize={8} fontWeight="600">{entry.amount}</SvgText>
      {LEDGER_BLANKS.map(y => (
        <G key={y}>
          <Line x1={18} y1={y - 3} x2={66} y2={y - 3} stroke="#2c2c2e" strokeDasharray="2 3" />
          <Line x1={78} y1={y - 3} x2={96} y2={y - 3} stroke="#2c2c2e" strokeDasharray="2 3" />
        </G>
      ))}
      {done ? (
        <G>
          <Circle cx={100} cy={12} r={10} fill={COIN_GREEN.face} />
          <Path d="M95 12 l3.5 3.5 l6.5 -7" fill="none" stroke="#0b2e17" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      ) : (
        <Path d="M100 40 l8 -8" stroke="#e5e5e5" strokeWidth={2} />
      )}
    </Svg>
  );
}

// Six month boxes for learn_emergency_fund, three to a row, filled from the bottom as
// far as the savings reach (a month and a half fills the first box and half the
// second). An umbrella opens over them, and the target is named underneath.
const COVER_BOX = 34;
const UMBRELLA = 'M10 52 q65 -60 130 0 q-11 -9 -22 0 q-11 -9 -21 0 q-11 -9 -22 0 q-11 -9 -22 0 q-11 -9 -21 0 q-11 -9 -22 0z';
const COVER_GAP = 5;

export function MonthsCover({ months, label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={150} height={62} viewBox="0 0 150 62">
        <Path d={UMBRELLA} fill={COIN_GREEN.face} />
        <Path d="M75 6 v-4" stroke="#e5e5e5" strokeWidth={2.5} strokeLinecap="round" />
        <Line x1={75} y1={52} x2={75} y2={62} stroke="#e5e5e5" strokeWidth={2.5} />
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: COVER_BOX * 3 + COVER_GAP * 2, gap: COVER_GAP, marginTop: 2 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const fill = Math.min(1, Math.max(0, months - i));
          return (
            <View key={i} style={{ width: COVER_BOX, height: COVER_BOX, borderRadius: 6, borderWidth: 1, borderColor: '#2c2c2e', backgroundColor: '#1c1c1e', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {fill > 0 && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, backgroundColor: COIN_GREEN.face }} />}
              <Text style={{ fontSize: 10, color: fill > 0 ? (fill >= 0.6 ? '#0b3d1f' : COIN_GREEN.face) : t.disabled }}>{i + 1}</Text>
            </View>
          );
        })}
      </View>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A family under a shield for learn_term_cover: three people inside a green shield,
// the card's label underneath.
const person = (x, y, s) => (
  <G key={`${x}-${y}`}>
    <Circle cx={x} cy={y} r={5 * s} fill="#e5e5e5" />
    <Path d={`M${x - 7 * s} ${y + 22 * s} q0 -14 ${7 * s} -14 q${7 * s} 0 ${7 * s} 14z`} fill="#e5e5e5" />
  </G>
);

export function FamilyShield({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={160} height={120} viewBox="0 0 160 120">
        <Path d="M80 6 l52 18 v30 q0 40 -52 60 q-52 -20 -52 -60 v-30z" fill="rgba(74,222,128,0.12)" stroke={COIN_GREEN.face} strokeWidth={3} />
        {person(60, 58, 1)}
        {person(80, 52, 1.1)}
        {person(100, 62, 0.8)}
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A clipboard for learn_health_cover: a heart at the top and three ticked lines, the
// card's label underneath.
const CLIP_TICKS = [70, 84, 98];

export function Clipboard({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={140} height={120} viewBox="0 0 140 120">
        <Rect x={30} y={12} width={80} height={104} rx={8} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
        <Rect x={52} y={4} width={36} height={14} rx={4} fill="#3a3a3c" />
        <Path d="M70 30 q-14 -12 -22 0 q-6 12 22 28 q28 -16 22 -28 q-8 -12 -22 0z" fill={COIN_RED.face} />
        {CLIP_TICKS.map(y => (
          <G key={y}>
            <Path d={`M44 ${y} l4 4 l8 -9`} fill="none" stroke={COIN_GREEN.face} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={62} y1={y + 1} x2={98} y2={y + 1} stroke="#3a3a3c" strokeWidth={2.5} strokeLinecap="round" />
          </G>
        ))}
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// Two coin stacks for learn_small_savings: what goes in (grey) beside what it grows to
// (green, a full stack), each with its amount on top and a caption below; the card's
// label under both. `captions` renames the two, and `greenFirst` (learn_start_early)
// puts the full green stack on the left and the smaller grey one on the right.
const GROW = { count: 14, w: 44, h: 6, ry: 6, step: 7 };

export function GrowStacks({ put, final, putLabel, finalLabel, label, captions = ['You put in', 'It grows to'], greenFirst = false, light = false }) {
  const t = textColor(light);
  const { count, w, h, ry, step } = GROW;
  const rx = w / 2;
  const putCoins = Math.max(1, Math.min(count, Math.round((count * put) / Math.max(final, 1))));
  const base = 14 + ry + (count - 1) * step;
  const height = base + h + ry + 2;
  const stack = (x, n, face, side, top) => (
    <G key={x}>
      {Array.from({ length: n }, (_, i) => (
        <G key={i}>
          <Path d={`M${x} ${base - i * step} v${h} a${rx} ${ry} 0 0 0 ${w} 0 v-${h}`} fill={side} />
          <Ellipse cx={x + rx} cy={base - i * step} rx={rx} ry={ry} fill={face} />
        </G>
      ))}
      <SvgText x={x + rx} y={base - n * step - 6} textAnchor="middle" fill="#e5e5e5" fontSize={9} fontWeight="600">{top}</SvgText>
    </G>
  );
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={150} height={height} viewBox={`0 0 150 ${height}`}>
        {stack(greenFirst ? 88 : 16, putCoins, '#6e6e73', '#3a3a3c', putLabel)}
        {stack(greenFirst ? 16 : 88, count, COIN_GREEN.face, COIN_GREEN.side, finalLabel)}
      </Svg>
      <View style={{ flexDirection: 'row', width: 150 }}>
        <Text style={{ width: 75, textAlign: 'center', fontSize: 10, color: t.tertiary }}>{captions[0]}</Text>
        <Text style={{ width: 75, textAlign: 'center', fontSize: 10, color: t.tertiary }}>{captions[1]}</Text>
      </View>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A shopping cart on pause for learn_before_you_buy: a cart with two boxes in it and a
// pause sign beside it, the card's label underneath.
export function CartPause({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={170} height={110} viewBox="0 0 170 110">
        <Path d="M10 20 h18 l14 52 h70 l12 -38 h-90" fill="none" stroke="#8a8a8a" strokeWidth={3} strokeLinejoin="round" />
        <Circle cx={50} cy={88} r={7} fill="#8a8a8a" />
        <Circle cx={104} cy={88} r={7} fill="#8a8a8a" />
        <Rect x={48} y={38} width={22} height={22} rx={3} fill="#3a3a3c" />
        <Rect x={74} y={44} width={18} height={16} rx={3} fill="#3a3a3c" />
        <Circle cx={140} cy={32} r={20} fill="rgba(229,229,229,0.08)" stroke="#e5e5e5" strokeWidth={2.5} />
        <Rect x={132} y={22} width={5} height={20} rx={1.5} fill="#e5e5e5" />
        <Rect x={143} y={22} width={5} height={20} rx={1.5} fill="#e5e5e5" />
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A laptop at night for learn_side_income: the moon and a few stars, a laptop glowing
// green, and coins stacking beside it; the card's label underneath.
const STARS = [[30, 16], [60, 8], [110, 20]];
const SCREEN_LINES = [[54, 100], [62, 90], [70, 96]];

export function LaptopNight({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={180} height={110} viewBox="0 0 180 110">
        <Path d="M150 14 a14 14 0 1 0 10 24 a11 11 0 1 1 -10 -24z" fill="#e5e5e5" />
        {STARS.map(([x, y]) => <Circle key={x} cx={x} cy={y} r={1.4} fill="#8a8a8a" />)}
        <Rect x={40} y={40} width={80} height={50} rx={5} fill="#1c1c1e" stroke="#3a3a3c" strokeWidth={2} />
        <Rect x={48} y={48} width={64} height={34} rx={2} fill="#0e2a1a" />
        {SCREEN_LINES.map(([y, x2]) => <Line key={y} x1={54} y1={y} x2={x2} y2={y} stroke={COIN_GREEN.face} strokeWidth={2} strokeLinecap="round" opacity={0.7} />)}
        <Path d="M30 92 h100 l-8 8 h-84z" fill="#3a3a3c" />
        {[0, 1, 2].map(i => (
          <G key={i}>
            <Ellipse cx={150} cy={98 - i * 6 + 2} rx={12} ry={4} fill={COIN_GREEN.side} />
            <Ellipse cx={150} cy={98 - i * 6} rx={12} ry={4} fill={COIN_GREEN.face} />
          </G>
        ))}
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A sunset for learn_freedom_number (early retirement): the sun half under the sea,
// its reflection in three lines, and a palm at the edge; the card's label underneath.
export function Sunset({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={180} height={110} viewBox="0 0 180 110">
        <Path d="M60 70 a30 30 0 0 1 60 0z" fill={COIN_GREEN.face} />
        <Line x1={10} y1={70} x2={170} y2={70} stroke="#3a3a3c" strokeWidth={2} />
        {[0, 1, 2].map(i => (
          <Line key={i} x1={50 + i * 10} y1={78 + i * 8} x2={130 - i * 10} y2={78 + i * 8} stroke={COIN_GREEN.side} strokeWidth={2} strokeLinecap="round" opacity={0.7 - i * 0.2} />
        ))}
        <Path d="M150 70 q-4 -30 2 -50" stroke="#8a8a8a" strokeWidth={3} fill="none" />
        <Path d="M152 20 q-16 -4 -24 6 M152 20 q14 -8 22 0 M152 20 q-6 -12 -16 -14 M152 20 q8 -12 18 -10" stroke="#8a8a8a" strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// Tangled lines straightening into one for learn_frugal (simple money): two grey
// scribbles on the left, an arrow, and one clean green line on the right.
export function Untangle({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={200} height={100} viewBox="0 0 200 100">
        <Path d="M6 30 C30 0 40 90 60 50 S80 10 90 60 S50 80 40 40 S80 20 94 50" fill="none" stroke="#5a5a5e" strokeWidth={2} />
        <Path d="M8 70 C30 90 50 10 70 40 S90 80 94 50" fill="none" stroke="#3a3a3c" strokeWidth={2} />
        <Path d="M104 50 h18 m-6 -6 l6 6 l-6 6" stroke="#5a5a5e" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Line x1={134} y1={50} x2={194} y2={50} stroke={COIN_GREEN.face} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={194} cy={50} r={5} fill={COIN_GREEN.face} />
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A five-step staircase for learn_five_milestones: each step numbered and a shade
// greener than the last, a flag on the top one; the card's label underneath.
export function Stairs({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={190} height={116} viewBox="0 0 190 116">
        {Array.from({ length: 5 }, (_, i) => {
          const x = 8 + i * 34;
          const h = 18 + i * 18;
          return (
            <G key={i}>
              <Rect x={x} y={108 - h} width={32} height={h} rx={3} fill={COIN_GREEN.face} opacity={0.3 + i * 0.17} />
              <SvgText x={x + 16} y={108 - h + 14} textAnchor="middle" fill="#0b3d1f" fontSize={10} fontWeight="700">{i + 1}</SvgText>
            </G>
          );
        })}
        <Line x1={160} y1={18} x2={160} y2={2} stroke="#e5e5e5" strokeWidth={1.5} />
        <Path d="M160 2 l12 4 l-12 4z" fill={COIN_GREEN.face} />
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// A credit card cut in half for learn_no_credit_card: the two halves pulled apart and
// tilted, scissors through the gap; the card's label underneath.
const CARD_HALF = (
  <G>
    <Rect x={30} y={38} width={96} height={60} rx={7} fill="#3a3a3c" />
    <Rect x={30} y={50} width={96} height={10} fill="#1c1c1e" />
    <Rect x={40} y={70} width={16} height={12} rx={2} fill="#8a8a8a" />
  </G>
);

export function CardCut({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={190} height={110} viewBox="0 0 190 110">
        <Defs>
          <ClipPath id="cardLeft"><Rect x={0} y={0} width={70} height={110} /></ClipPath>
          <ClipPath id="cardRight"><Rect x={70} y={0} width={120} height={110} /></ClipPath>
        </Defs>
        <G clipPath="url(#cardLeft)" transform="translate(-8 4) rotate(-8 70 55)">{CARD_HALF}</G>
        <G clipPath="url(#cardRight)" transform="translate(10 -4) rotate(8 70 55)">{CARD_HALF}</G>
        <Circle cx={150} cy={22} r={9} fill="none" stroke="#e5e5e5" strokeWidth={3} />
        <Circle cx={168} cy={38} r={9} fill="none" stroke="#e5e5e5" strokeWidth={3} />
        <Path d="M144 30 L100 60 M160 32 L100 62" stroke="#e5e5e5" strokeWidth={3.5} strokeLinecap="round" />
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// "Do I need it?" for learn_impulse: a person stopped with the question in a thought
// bubble, the shopping bag faded beside them; the card's label underneath.
export function NeedIt({ label, light = false }) {
  const t = textColor(light);
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={180} height={112} viewBox="0 0 180 112">
        <Circle cx={44} cy={44} r={12} fill="#e5e5e5" />
        <Path d="M44 58 v26 M44 84 l-10 20 M44 84 l10 20 M44 66 l16 6" stroke="#e5e5e5" strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M66 22 h60 a10 10 0 0 1 10 10 v8 a10 10 0 0 1 -10 10 h-46 l-10 8 v-8 h-4 a10 10 0 0 1 -10 -10 v-8 a10 10 0 0 1 10 -10z" fill="#1c1c1e" stroke="#3a3a3c" />
        <SvgText x={96} y={40} textAnchor="middle" fill="#e5e5e5" fontSize={9}>Do I need it?</SvgText>
        <G opacity={0.6}>
          <Path d="M120 92 h30 l-4 -26 h-22z" fill="#3a3a3c" />
          <Path d="M128 66 v-6 a7 7 0 0 1 14 0 v6" fill="none" stroke="#3a3a3c" strokeWidth={3} />
        </G>
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// Two grey biscuit packs for learn_inflation, a year under each and its price above:
// wide rectangles with the name in yellow and a row of stacked biscuits inside. The
// name is typed on a plain pack, not the brand's own wrapper.
const PACK = { w: 84, h: 54, biscuits: 8 };

export function Packs({ packs, label, light = false }) {
  const t = textColor(light);
  const { w, h, biscuits } = PACK;
  const bw = (w - 16) / biscuits;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={200} height={110} viewBox="0 0 200 110">
        {packs.map((p, k) => {
          const x = 8 + k * 100;
          const y = 30;
          return (
            <G key={p.year}>
              <Rect x={x} y={y} width={w} height={h} rx={6} fill="#3a3a3c" />
              {Array.from({ length: biscuits }, (_, i) => (
                <Rect key={i} x={x + 8 + i * bw} y={y + h - 26} width={bw - 2} height={18} rx={3} fill="#5a5a5e" />
              ))}
              <SvgText x={x + w / 2} y={y + 18} textAnchor="middle" fill="#facc15" fontSize={11} fontWeight="800">Parle-G</SvgText>
              <SvgText x={x + w / 2} y={y - 6} textAnchor="middle" fill="#ffffff" fontSize={11} fontWeight="700">{p.price}</SvgText>
              <SvgText x={x + w / 2} y={y + h + 14} textAnchor="middle" fill={t.tertiary} fontSize={9}>{p.year}</SvgText>
            </G>
          );
        })}
      </Svg>
      {!!label && <Text style={{ fontSize: FONT.caption, color: t.tertiary, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

// Lifestyle creep for learn_lifestyle_creep: two show-off icons (a watch and a phone)
// side by side on one line, centred in the left half; a divider; and coin stacks of
// different heights on the right, the saving instead. A label sits under each side.
const CREEP_GREY = '#6e6e73';

// Both icons are 36 tall and drawn about their own centre, so one centre line serves
// the pair: `cy` is that line.
function CreepWatch({ cx, cy }) {
  return (
    <G transform={`translate(${cx - 16} ${cy - 18})`}>
      <Rect x={9} y={0} width={14} height={6} rx={2} fill={CREEP_GREY} />
      <Rect x={9} y={30} width={14} height={6} rx={2} fill={CREEP_GREY} />
      <Circle cx={16} cy={18} r={12} fill="none" stroke={CREEP_GREY} strokeWidth={3} />
      <Path d="M16 18 v-6 M16 18 l5 3" stroke={CREEP_GREY} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

function CreepPhone({ cx, cy }) {
  return (
    <G transform={`translate(${cx - 16} ${cy - 18})`}>
      <Rect x={6} y={0} width={20} height={36} rx={4} fill="none" stroke={CREEP_GREY} strokeWidth={3} />
      <Circle cx={16} cy={31} r={1.6} fill={CREEP_GREY} />
    </G>
  );
}

const CREEP_STACKS = [[174, 4], [212, 7], [250, 5]];
// The lowest coin of each stack sits here.
const CREEP_BASE = 97;

export function CreepSplit({ leftLabel, rightLabel, light = false }) {
  return (
    <Svg width={280} height={134} viewBox="0 0 280 134">
      <CreepWatch cx={48} cy={60} />
      <CreepPhone cx={92} cy={60} />
      <Line x1={140} y1={10} x2={140} y2={112} stroke="#2c2c2e" strokeWidth={2} />
      {CREEP_STACKS.map(([x, n]) => Array.from({ length: n }, (_, i) => (
        <G key={`${x}-${i}`}>
          <Ellipse cx={x} cy={CREEP_BASE - i * 7 + 2.5} rx={17} ry={5.2} fill={COIN_GREEN.side} />
          <Ellipse cx={x} cy={CREEP_BASE - i * 7} rx={17} ry={5.2} fill={COIN_GREEN.face} />
        </G>
      )))}
      <SvgText x={70} y={126} textAnchor="middle" fill={light ? '#444444' : '#b5b5b5'} fontSize={10}>{leftLabel}</SvgText>
      <SvgText x={212} y={126} textAnchor="middle" fill={COIN_GREEN.face} fontSize={10}>{rightLabel}</SvgText>
    </Svg>
  );
}

// "72 rule" as plain text for learn_rule_of_72: a big green 72 and a small "rule".
export function Rule72({ light = false }) {
  const t = textColor(light);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={{ fontSize: 54, fontWeight: '600', letterSpacing: -1, color: COIN_GREEN.face }}>72</Text>
      <Text style={{ fontSize: 20, color: t.tertiary }}>rule</Text>
    </View>
  );
}

// EMI worry against cash peace for story_phone_emi: a worried grey figure on the left,
// a figure asleep with the bike beside them on the right, a divider between; a label
// under each side.
const BIKE_PATH = 'M12 30 L26 12 H44 L56 30 M26 12 L34 30 H56 M44 12 L48 6 H54';

export function WorryPeace({ light = false }) {
  const t = textColor(light);
  return (
    <Svg width={230} height={118} viewBox="0 0 230 118">
      <Line x1={115} y1={6} x2={115} y2={102} stroke="#2c2c2e" strokeWidth={2} />
      <Circle cx={50} cy={26} r={9} fill="#8a8a8a" />
      <Path d="M50 36 v22 M50 58 l-8 18 M50 58 l9 16 M50 42 l-11 8 M50 42 l11 6" stroke="#8a8a8a" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <Path d="M62 18 q4 -6 8 0 q4 -6 8 0" stroke={COIN_RED.face} strokeWidth={2} fill="none" strokeLinecap="round" />
      <SvgText x={50} y={96} textAnchor="middle" fill={COIN_RED.face} fontSize={8}>EMI worries</SvgText>
      <Circle cx={172} cy={40} r={9} fill="#e5e5e5" />
      <Path d="M162 56 q10 -10 20 0 v14 h-20z" fill="#e5e5e5" />
      <Rect x={148} y={70} width={48} height={6} rx={3} fill="#3a3a3c" />
      <SvgText x={190} y={26} fill={t.tertiary} fontSize={12}>z</SvgText>
      <SvgText x={199} y={18} fill={t.tertiary} fontSize={9}>Z</SvgText>
      <G transform="translate(150 2) scale(0.5)">
        <Circle cx={12} cy={30} r={11} fill="none" stroke={COIN_GREEN.face} strokeWidth={3} />
        <Circle cx={56} cy={30} r={11} fill="none" stroke={COIN_GREEN.face} strokeWidth={3} />
        <Path d={BIKE_PATH} fill="none" stroke={COIN_GREEN.face} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </G>
      <SvgText x={172} y={96} textAnchor="middle" fill={COIN_GREEN.face} fontSize={8}>paid cash, sleeps well</SvgText>
    </Svg>
  );
}

// The same rain on two people for story_job_loss: on the left one with no umbrella, on
// the right one under a green umbrella, both on the same ground line. Each side uses
// the same eight raindrops; the umbrella is drawn over them. A label per side sits on
// one baseline at the bottom.
const RAIN = [[16, 8], [40, 34], [62, 12], [84, 40], [104, 20], [28, 50], [74, 56], [96, 6]];

function Rain({ dx }) {
  return RAIN.map(([x, y]) => (
    <Line key={`${dx}-${x}-${y}`} x1={x + dx} y1={y} x2={x + dx - 3} y2={y + 9} stroke="#5a5a5e" strokeWidth={1.6} strokeLinecap="round" />
  ));
}

function Figure({ x, color }) {
  return (
    <G transform={`translate(${x} 72)`}>
      <Circle cx={0} cy={0} r={8} fill={color} />
      <Path d="M-12 42 q0 -26 12 -26 q12 0 12 26z" fill={color} />
    </G>
  );
}

export function RainUmbrella({ leftLabel, rightLabel, light = false }) {
  return (
    <Svg width={260} height={134} viewBox="0 0 260 134">
      <Rain dx={6} />
      <Rain dx={134} />
      <Line x1={130} y1={10} x2={130} y2={118} stroke="#1c1c1e" strokeWidth={2} />
      <Figure x={66} color="#8a8a8a" />
      <Figure x={194} color="#e5e5e5" />
      <Path d="M146 58 a48 34 0 0 1 96 0 q-16 -9 -32 0 q-16 -9 -32 0 q-16 -9 -32 0z" fill={COIN_GREEN.face} />
      <Line x1={194} y1={58} x2={194} y2={66} stroke="#e5e5e5" strokeWidth={2} />
      <SvgText x={66} y={130} textAnchor="middle" fill={COIN_RED.face} fontSize={10}>{leftLabel}</SvgText>
      <SvgText x={194} y={130} textAnchor="middle" fill={COIN_GREEN.face} fontSize={10}>{rightLabel}</SvgText>
    </Svg>
  );
}

// The month as a receipt for the biggest_expense insight: its largest few spends, the
// biggest highlighted at the top, a torn edge at the bottom. Beside the text, so narrow.
const RECEIPT = { w: 124, paper: '#1c1c1e', edge: '#3a3a3c', tooth: 8, toothH: 6 };
const plain = (n) => Math.round(n).toLocaleString('en-IN');

export function Receipt({ heading, rows, light = false }) {
  const t = textColor(light);
  const { w, paper, edge, tooth, toothH } = RECEIPT;
  // The torn edge: a zigzag across the bottom.
  let zig = `M0.5 0 V${toothH}`;
  for (let x = 0; x < w - 1; x += tooth) {
    zig += ` L${Math.min(w - 0.5, x + tooth / 2)} 0.5 L${Math.min(w - 0.5, x + tooth)} ${toothH}`;
  }
  zig += ` V0`;
  return (
    <View style={{ width: w }}>
      <View style={{ backgroundColor: paper, borderWidth: 1, borderBottomWidth: 0, borderColor: edge, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingHorizontal: 7, paddingTop: 10, paddingBottom: 10 }}>
        <Text style={{ fontSize: 9, letterSpacing: 1, color: t.tertiary, textAlign: 'center', marginBottom: 8 }}>{heading}</Text>
        {rows.map((r, i) => {
          const top = i === 0;
          return (
            <View
              key={i}
              style={{
                flexDirection: 'row', justifyContent: 'space-between', gap: 6,
                paddingHorizontal: 5, paddingVertical: top ? 5 : 0, marginTop: top ? 0 : 6,
                borderRadius: 3, backgroundColor: top ? 'rgba(248,113,113,0.18)' : 'transparent',
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1, fontSize: top ? 10 : 9.5, fontWeight: top ? '600' : '400', color: top ? COIN_RED.face : t.tertiary }}>{r.label}</Text>
              <Text style={{ fontSize: top ? 10 : 9.5, fontWeight: top ? '600' : '400', color: top ? COIN_RED.face : t.tertiary, ...TABULAR }}>{plain(r.amount)}</Text>
            </View>
          );
        })}
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: edge, marginTop: 10 }} />
      </View>
      <Svg width={w} height={toothH + 1} viewBox={`0 0 ${w} ${toothH + 1}`}>
        <Path d={zig} fill={paper} stroke={edge} strokeWidth={1} />
      </Svg>
    </View>
  );
}
