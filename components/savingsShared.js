import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { formatCurrency, formatCurrencyFull } from '../utils/format';
import { CARD_RADIUS, SMOOTH } from './Glass';
import { SETTLE_EASING } from '../utils/motion';

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
    sectionTotal: 'Total Savings',
    listLabel: 'Add new saving goal',
    newLabel: 'Add saving goal',
    emptyTitle: 'Start your first goal',
    emptyBody: "Track what you're setting aside for a bike, a home, or a rainy day.",
    namePlaceholder: 'Goal name',
    amountFieldLabel: '',
    sheetTitleNew: 'Add saving goal',
    sheetTitleEdit: 'Edit goal',
    submitLabel: 'Add Goal',
    figureSuffix: 'saved',
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
    deleteNoun: 'goal',
    addedLabel: 'Added',
    withdrewLabel: 'Withdrew',
    depositWord: 'deposit',
  },
  debt: {
    sectionTotal: 'Total Debt',
    listLabel: 'Track new loan',
    newLabel: 'New loan',
    emptyTitle: 'Track your first loan',
    emptyBody: 'Car loan, personal loan, an EMI, money from a friend — anything you owe, in one place.',
    namePlaceholder: 'Loan name',
    amountFieldLabel: 'Amount paid',
    sheetTitleNew: 'New loan',
    sheetTitleEdit: 'Edit loan',
    submitLabel: 'Add Loan',
    figureSuffix: 'remaining',
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
    deleteNoun: 'loan',
    addedLabel: 'Payment',
    withdrewLabel: 'Payment',
    depositWord: 'payment',
  },
};

// Ideas offered under the loan name field and on the empty state — the
// same fast-path suggestion chips GOAL_SUGGESTIONS gives Savings, just
// pointed at the loan types the debt tracker actually gets used for.
export const DEBT_SUGGESTIONS = ['Car Loan', 'Personal Loan', 'Bike Loan', 'Gold Loan', 'Friend Loan', 'No Cost EMI'];

export const dim = (light, a = 0.4) => (light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

// Solid rounded bar. Fills toward its value whenever it changes, and on first
// mount — the width is a percentage string on the UI thread, so no layout
// measuring is needed. `color` overrides the usual green, for a caller that
// wants this same bar in a different state's colour (Budget's own status
// bar draws its own instead, rather than using this one).
export function ProgressBar({ percent, height = 6, light, color = FILL_COLOR, trackColor, duration = 420 }) {
  const progress = useSharedValue(0);
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
