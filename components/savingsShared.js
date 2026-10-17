import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { formatCurrency, formatCurrencyFull } from '../utils/format';
import { CARD_RADIUS, SMOOTH } from './Glass';
import { SETTLE_EASING } from '../utils/motion';
import { textColor } from '../utils/colors';
import { FONT, TABULAR } from '../utils/type';

// Small pieces shared by the savings list and its goal cards.

const CARD_COLOR = '#151515';
const FILL_COLOR = '#4ade80';
export const POSITIVE = 'rgba(74,222,128,0.85)';

export const money = (n) => (Number.isInteger(n) ? formatCurrency(n) : formatCurrencyFull(n));

// Every string/label that differs between the two goal directions, in one
// place — Savings and Debt reuse every component in this family (Card,
// GoalCard, GoalSheet, MoneySheet, SavingsSection/GoalDetail), swapping only
// what's said, never how it's built. `kind` is 'savings' (default, every
// existing caller) or 'debt'. Debt's own numbers are still just `saved`
// (paid so far) and `target` (what was owed when the loan was added) under
// the hood — see useSavings.js's own comment on why that needs no new
// fields — this dictionary only changes the words wrapped around them.
export const KIND_COPY = {
  savings: {
    heroCaption: 'saved so far',
    newLabel: 'Add saving goal',
    emptyTitle: 'What are you saving for?',
    emptyBody: 'Emergency fund, trip, a phone…\nTap + to add a goal',
    namePlaceholder: 'Goal name',
    sheetTitleNew: 'Add saving goal',
    sheetTitleEdit: 'Edit goal',
    submitLabel: 'Add Goal',
    fabLabel: 'Add or withdraw money',
    editGoalLabel: 'Edit goal',
    historyTitle: 'History',
    historyEmpty: 'Nothing added yet.',
    monthlyTitle: 'Monthly savings',
    completedLabel: 'Completed',
    reachedLabel: 'Goal reached',
    markDoneLabel: 'Mark as done',
    celebrationTitle: 'Congrats, you made it',
    deleteTitle: 'Delete goal?',
    addedLabel: 'Added',
    withdrewLabel: 'Withdrew',
    depositWord: 'deposit',
  },
  debt: {
    heroCaption: 'left to pay',
    newLabel: 'New loan',
    emptyTitle: 'What are you paying off?',
    emptyBody: 'Car, bike, personal, a friend…\nTap + to add a loan',
    namePlaceholder: 'Loan name',
    sheetTitleNew: 'New loan',
    sheetTitleEdit: 'Edit loan',
    submitLabel: 'Add Loan',
    fabLabel: 'Log a payment',
    editGoalLabel: 'Edit loan',
    historyTitle: 'Payments',
    historyEmpty: 'No payments logged yet.',
    monthlyTitle: 'EMI tracker',
    completedLabel: 'Cleared',
    reachedLabel: 'Loan cleared',
    markDoneLabel: 'Mark as cleared',
    celebrationTitle: "Congrats, it's cleared",
    deleteTitle: 'Delete loan?',
    addedLabel: 'Payment',
    withdrewLabel: 'Payment',
    depositWord: 'payment',
  },
};

export const dim = (light, a = 0.4) => (light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

// Solid rounded bar. Fills toward its value whenever it changes, and on first
// mount — the width is a percentage string on the UI thread, so no layout
// measuring is needed. `color` overrides the usual green, for a caller that
// wants this same bar in a different state's colour (Budget's own status
// bar draws its own instead, rather than using this one).
export function ProgressBar({ percent, height = 6, light, color = FILL_COLOR, trackColor, duration = 420, still = false }) {
  // `still`: starts already at its value instead of filling up from empty, for a bar
  // that appears with the rest of a list changing under it, not a page just opening.
  const progress = useSharedValue(still ? percent / 100 : 0);
  useEffect(() => {
    progress.value = withTiming(percent / 100, { duration, easing: SETTLE_EASING });
  }, [percent, progress, duration]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: trackColor ?? dim(light, 0.08) }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, fillStyle]} />
    </View>
  );
}

// The fill of a Card. A row that slides aside (swipe to delete) has to paint this
// itself, or the button underneath shows through it.
export const cardFill = (light) => (light ? '#FFFFFF' : CARD_COLOR);

export function Card({ children, light }) {
  return (
    <View style={{ backgroundColor: cardFill(light), borderRadius: CARD_RADIUS, ...SMOOTH, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

// The page's strongest text colour, for names and headline figures.
export const ink = (light) => (light ? '#111111' : '#ffffff');

// The small capitals above a block ("MONTHLY EMI", "PAYMENTS", "LOANS · 3"). `inset`
// is the side padding: 20 lines up with a Card's content, 16 with a row inside one;
// `bottom` the gap under it, 0 where the label sits in a row that has its own.
export function SectionLabel({ light, inset = 20, bottom = 8, children }) {
  return (
    <Text
      className="text-[11px] font-medium uppercase tracking-wider"
      style={{ paddingHorizontal: inset, marginBottom: bottom, color: textColor(light).disabled }}
    >
      {children}
    </Text>
  );
}

// A small caption over a figure, centred on each other ("Total loan" / ₹60,000).
export function Stat({ light, label, value }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text className="text-[13px]" style={{ color: textColor(light).tertiary }}>{label}</Text>
      <Text style={{ fontSize: FONT.body, fontWeight: '500', color: textColor(light).primary, marginTop: 2, ...TABULAR }}>{value}</Text>
    </View>
  );
}
