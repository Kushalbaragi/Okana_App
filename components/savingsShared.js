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
    newLabel: 'New goal',
    emptyTitle: 'Start your first goal',
    emptyBody: "Track what you're setting aside for a bike, a home, or a rainy day.",
    nameFieldLabel: 'Goal',
    namePlaceholder: 'Goal name',
    whereFieldLabel: 'Where',
    wherePlaceholder: 'Bank, liquid fund... (optional)',
    amountFieldLabel: 'Target',
    sheetTitleNew: 'New goal',
    sheetTitleEdit: 'Edit goal',
    submitLabel: 'Add Goal',
    figureSuffix: 'saved',
    targetSuffix: 'target',
    fabLabel: 'Add or withdraw money',
    editGoalLabel: 'Edit goal',
    historyTitle: 'History',
    historyEmpty: 'Nothing added yet.',
    monthlyTitle: 'Monthly savings',
    monthlyAvgSuffix: 'average per month',
    completedLabel: 'Completed',
    reachedLabel: 'Goal reached',
    markDoneLabel: 'Mark as done',
    celebrationTitle: 'Congrats, you made it',
    deleteTitle: 'Delete goal?',
    deleteNoun: 'goal',
    addedLabel: 'Added',
    withdrewLabel: 'Withdrew',
    depositWord: 'deposit',
    withdrawalWord: 'withdrawal',
    moneySheetLabel: (goalName) => goalName,
  },
  debt: {
    sectionTotal: 'Total Owed',
    newLabel: 'New loan',
    emptyTitle: 'Track your first loan',
    emptyBody: 'Car loan, personal loan, an EMI, money from a friend — anything you owe, in one place.',
    nameFieldLabel: 'Loan',
    namePlaceholder: 'Loan name',
    whereFieldLabel: 'From',
    wherePlaceholder: "Bank, friend's name... (optional)",
    amountFieldLabel: 'Outstanding amount',
    sheetTitleNew: 'New loan',
    sheetTitleEdit: 'Edit loan',
    submitLabel: 'Add Loan',
    figureSuffix: 'remaining',
    targetSuffix: 'at start',
    fabLabel: 'Log a payment',
    editGoalLabel: 'Edit loan',
    historyTitle: 'Payments',
    historyEmpty: 'No payments logged yet.',
    monthlyTitle: 'EMI tracker',
    monthlyAvgSuffix: 'EMIs paid',
    tenureFieldLabel: 'Tenure',
    alreadyPaidFieldLabel: 'Paid',
    completedLabel: 'Cleared',
    reachedLabel: 'Loan cleared',
    markDoneLabel: 'Mark as cleared',
    celebrationTitle: "Congrats, it's cleared",
    deleteTitle: 'Delete loan?',
    deleteNoun: 'loan',
    addedLabel: 'Payment',
    withdrewLabel: 'Payment',
    depositWord: 'payment',
    withdrawalWord: 'payment',
    moneySheetLabel: (goalName) => goalName,
  },
};

// Ideas offered under the loan name field and on the empty state — the
// same fast-path suggestion chips GOAL_SUGGESTIONS gives Savings, just
// pointed at the loan types the debt tracker actually gets used for.
export const DEBT_SUGGESTIONS = ['Car Loan', 'Personal Loan', 'Bike Loan', 'Gold Loan', 'Friend Loan', 'No Cost EMI'];

export const dim = (light, a = 0.4) => (light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

// Solid rounded bar. Fills toward its value whenever it changes, and on first
// mount — the width is a percentage string on the UI thread, so no layout
// measuring is needed. `color` overrides the usual green — the Budget bar
// switches it to red once spend crosses the budget, the same "money leaving"
// red used everywhere else (see utils/colors.js's EXPENSE).
export function ProgressBar({ percent, height = 6, light, color = FILL_COLOR }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percent / 100, { duration: 420, easing: SETTLE_EASING });
  }, [percent, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: dim(light, 0.08) }}>
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
