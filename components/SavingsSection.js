import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, FadeIn } from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GlassPressable, CARD_RADIUS, SMOOTH } from './Glass';
import MonthSlider from './MonthSlider';
import PaymentGrid from './PaymentGrid';
import SlideToPay from './SlideToPay';
import PaidMoment from './PaidMoment';
import JarMoment from './JarMoment';
import Celebration from './Celebration';
import ErrorBoundary from './ErrorBoundary';
import { InlineConfirm } from './InlineConfirm';
import { ConfirmPill } from './ConfirmPill';
import { GoalSheet, MoneySheet } from './SavingsSheets';
import GoalCard from './GoalCard';
import { SwipeDeleteAction, useSwipeDelete, useSwipeGroup } from './SwipeDeleteAction';
import { Card, ProgressBar, POSITIVE, cardFill, dim, money, KIND_COPY } from './savingsShared';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';
import { CheckIcon, ChevronRight, EditIcon, PlusIcon } from './icons';
import { currentMonthYear, dateBoxParts, formatDateFull, today } from '../utils/format';
import { hapticAdded } from '../utils/haptics';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { GUTTER } from '../utils/spacing';
import useEmiPayFlow from '../hooks/useEmiPayFlow';

// List and detail swap by crossfade — the same fade the home screen uses for a
// tab switch, and cheap because it's opacity only.
const SWAP_MS = 220;
// How long after a money sheet closes before the jar moment opens: the sheet's
// own native Modal needs to be fully gone first.
// Shorter than this and iOS silently drops the jar altogether (presenting a Modal
// while the sheet's is still going), leaving the page holding its old figures —
// so the jar's own opening is what was made quicker, not this wait.
const JAR_START_DELAY_MS = 300;
// The longest the page keeps showing pre-transaction figures waiting on the jar.
const JAR_HOLD_FAILSAFE_MS = 30000;
// Once the jar is gone the page plays what changed one part at a time, so each can
// be seen: the status card at the top, then — this long after — the monthly
// savings card, then — this long after that — the transaction joins the history.
// The new row's "just added" marker lingers a little after it appears.
const REVEAL_START_MS = 150;
const REVEAL_STEP_MS = 700;
const REVEAL_ROW_MARK_MS = 2000;
// A new transaction joins the history in two beats: the rows already there slide
// down to make room, then — once they have — the new row fades in.
const ROW_SLIDE_MS = 650;
const NEW_ROW_FADE_MS = 700;
// Until a history row has been measured, how tall to make room for a new one.
const DEFAULT_ROW_H = 64;

// Padding and alignment are inline styles here, not classNames, on the
// GlassPressables below: className on an animated component depends on
// NativeWind's interop, which react-native-web doesn't apply, so an inline
// style is the one form that renders identically everywhere.
const HISTORY_PAD = { paddingHorizontal: 16, paddingVertical: 12 };
const CENTERED = { alignItems: 'center', justifyContent: 'center' };

// Empty months drawn after the current one on the goal's slider, as a place for
// what's still to come.
const PLACEHOLDER_MONTHS = 12;

// How long after a delete is confirmed it goes ahead even if the dialog never
// reports having closed (see flushPendingDelete): longer than its close animation.
const GOAL_DELETE_BACKSTOP_MS = 700;
// How long after logging an EMI payment before the "add to your
// transactions?" pill appears — same value WalletPage's own plan-check
// confirm uses, so the two read as one consistent beat.
const EMI_CONFIRM_DELAY_MS = 1500;

// Months since year 0 for a plain "YYYY-MM-DD", so two dates compare (and
// subtract) as whole months.
const monthIndexOf = (dateStr) => Number(dateStr.slice(0, 4)) * 12 + Number(dateStr.slice(5, 7)) - 1;

// Asking "add this to your expenses?" after an EMI payment is logged — the
// same beat (see EMI_CONFIRM_DELAY_MS), the same pill, and the same
// money-moving calls (`logEntryAsExpense`/`linkEntryTransaction`) regardless
// of WHERE the payment came from. Shared rather than duplicated because
// there are now two callers: SavingsSheetsHost's own MoneySheet submit, and
// GoalDetail's own slide-to-pay control (see its own comment) — both
// log a payment and both owe the user this same follow-up.
function useEmiExpenseConfirm(savings, showToast) {
  const [pending, setPending] = useState(null);
  const delayRef = useRef(null);
  useEffect(() => () => clearTimeout(delayRef.current), []);

  // A beat after the payment lands, not the instant it does — reads as a
  // follow-up prompt rather than a jarring interruption right on top of
  // whatever just closed (a sheet sliding away, or the CTA's own tap).
  const schedule = useCallback(({ entryId, amount, date, name }) => {
    clearTimeout(delayRef.current);
    delayRef.current = setTimeout(() => setPending({ entryId, amount, date, name }), EMI_CONFIRM_DELAY_MS);
  }, []);

  const resolve = useCallback((addTransaction) => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (!addTransaction) return;
    (async () => {
      const result = await savings.logEntryAsExpense({ amount: p.amount, date: p.date, description: p.name });
      if (!result?.success) return;
      // Links the new expense back onto the payment entry that prompted it,
      // so deleting the entry later takes this expense with it (see
      // useSavings.deleteEntry) instead of leaving it orphaned on Home.
      if (p.entryId) savings.linkEntryTransaction(p.entryId, result.id);
      // A full second after the pill has closed, not right on top of it —
      // see WalletPage's own comment on the same delay for its plan-check
      // confirm.
      setTimeout(() => showToast?.(`${p.name} added to your expenses`), 1000);
    })();
  }, [pending, savings, showToast]);

  return {
    pending,
    schedule,
    confirm: useCallback(() => resolve(true), [resolve]),
    decline: useCallback(() => resolve(false), [resolve]),
  };
}

// A line on how the goal got there: how many deposits (or payments, for a
// loan), over how long, since when. Empty when there are none to speak of.
function journeyNote(entries, depositWord = 'deposit') {
  const deposits = entries.filter(e => e.type === 'add').length;
  if (deposits === 0) return '';
  const first = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
  const days = Math.max(1, Math.floor((Date.now() - new Date(`${first}T00:00:00`).getTime()) / 86400000));
  const span = days < 60 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(days / 30.44)} months`;
  return `${deposits} ${depositWord}${deposits === 1 ? '' : 's'} over ${span} · since ${MONTH_NAMES[Number(first.slice(5, 7)) - 1].slice(0, 3)} ${first.slice(0, 4)}`;
}

// What a finished goal's celebration says. An EMI loan gets its own wording —
// the loan's name, "Fully paid" (or how many months early, if it was closed
// ahead of the planned finish month), and what it cost in total. A flexible
// debt says the same minus the schedule (no planned finish, no EMI count).
// Everything else keeps the generic copy.
function celebrationCopy(goal, kind, copy) {
  if (kind === 'debt' && goal.debtType === 'flexible') {
    return { title: goal.name, subtitle: 'Fully paid', note: `${money(goal.target)} repaid` };
  }
  if (kind !== 'debt' || goal.debtType !== 'emi') {
    return { title: copy.celebrationTitle, subtitle: `${goal.name} · ${money(goal.target)}`, note: journeyNote(goal.entries, copy.depositWord) };
  }
  let monthsEarly = 0;
  if (goal.estimatedFinishDate) {
    const { month, year } = currentMonthYear();
    monthsEarly = monthIndexOf(goal.estimatedFinishDate) - (year * 12 + month);
  }
  return {
    title: goal.name,
    subtitle: monthsEarly >= 1 ? `Fully paid, ${monthsEarly} month${monthsEarly === 1 ? '' : 's'} early` : 'Fully paid',
    note: goal.totalRepayment != null ? `${goal.tenureMonths} EMIs · ${money(goal.totalRepayment)} repaid` : '',
  };
}

// ---------------------------------------------------------------------------
// Sheet state. Owned by the calendar page (not this section) because the
// sheets have to cover the whole page, header included — see InlineSheet — so
// they're rendered at that page's root by SavingsSheetsHost, while the list and
// detail views below only need the openers.
// ---------------------------------------------------------------------------
// `locked` (with `onLocked`) is for an account that can't add anything new — an
// expired trial, say. Starting a new goal or loan is then turned into
// `onLocked`; everything on one that already exists still works.
export function useSavingsUI({ locked = false, onLocked } = {}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // False from the moment a sheet opens until it has finished sliding away.
  // The list and goal page hold what they show for that whole stretch (see
  // SavingsSection), so what a sheet just saved appears once the sheet is gone
  // rather than changing behind it as it closes — the same beat as adding a
  // transaction on the home screen.
  const [sheetClosed, setSheetClosed] = useState(true);
  const markSheetClosed = useCallback(() => setSheetClosed(true), []);
  // Kept separate from `sheetOpen` so the sheet's content stays put while it
  // animates closed instead of blanking mid-slide.
  const [sheetData, setSheetData] = useState(null);

  const openNewGoal = useCallback((initialName = '') => {
    if (locked) { onLocked?.(); return; }
    setSheetData({ kind: 'goal', goalId: null, initialName });
    setSheetClosed(false);
    setSheetOpen(true);
  }, [locked, onLocked]);
  const openEditGoal = useCallback((goalId) => {
    setSheetData({ kind: 'goal', goalId, initialName: '' });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
  const openMoney = useCallback((goalId, type) => {
    setSheetData({ kind: 'money', goalId, entryId: null, type });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
  // A settlement, not a scheduled EMI — the amount isn't locked to the
  // loan's own monthly figure (see MoneySheet's own prefill), and submitting
  // it marks the loan done outright rather than letting the schedule's own
  // count catch up to it (see SavingsSheetsHost's submitMoney).
  const openCloseEarly = useCallback((goalId) => {
    setSheetData({ kind: 'money', goalId, entryId: null, type: 'add', closeEarly: true });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
  const openEntry = useCallback((goalId, entryId) => {
    setSheetData({ kind: 'money', goalId, entryId, type: 'add' });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // A new savings deposit or withdrawal, announced by the sheet that logged it
  // so the goal's page can play the jar moment once the sheet has gone (see
  // GoalDetail). `token` tells one event from the next.
  const [moneyEvent, setMoneyEvent] = useState(null);
  const emitMoney = useCallback((event) => setMoneyEvent({ ...event, token: Date.now() }), []);
  const clearMoney = useCallback(() => setMoneyEvent(null), []);

  // Backstop for a sheet that never reports finishing (the page it lives on
  // closing under it, say) — the hold must not outlive it.
  useEffect(() => {
    if (sheetOpen) return;
    const t = setTimeout(() => setSheetClosed(true), 600);
    return () => clearTimeout(t);
  }, [sheetOpen]);

  // The delete confirmation. Same split as the sheet: `confirmOpen` drives the
  // animation, `confirmData` keeps its text while it fades out.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const openDeleteGoal = useCallback((goalId) => {
    setConfirmData({ kind: 'goal', goalId });
    setConfirmOpen(true);
  }, []);
  const openDeleteEntry = useCallback((goalId, entryId) => {
    setConfirmData({ kind: 'entry', goalId, entryId });
    setConfirmOpen(true);
  }, []);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);

  return {
    sheetOpen, sheetData, sheetClosed, markSheetClosed, openNewGoal, openEditGoal, openMoney, openCloseEarly, openEntry, closeSheet,
    moneyEvent, emitMoney, clearMoney,
    confirmOpen, confirmData, openDeleteGoal, openDeleteEntry, closeConfirm,
  };
}

export function SavingsSheetsHost({ savings, ui, light = false, kind = 'savings', showToast }) {
  const copy = KIND_COPY[kind];
  const goalList = kind === 'debt' ? savings.allDebts : savings.allGoals;
  const { sheetOpen, sheetData, closeSheet, confirmOpen, confirmData, closeConfirm } = ui;
  const goalId = sheetData?.goalId ?? null;
  const goal = goalId ? goalList.find(g => g.id === goalId) : null;
  const entry = sheetData?.entryId && goal ? goal.entries.find(e => e.id === sheetData.entryId) : null;

  // `startingAmount` only ever arrives for a brand-new savings goal (see
  // GoalSheet's own step 2) — logged as that goal's first entry right after
  // it's created, dated today, so "I already had ₹50,000 saved for this"
  // shows up as real progress instead of a separate field nothing else reads.
  const submitGoal = useCallback(async ({ name, target, location, debtType, tenureMonths, emisPaidBefore, firstEmiDate, startingAmount, emiAmount }) => {
    if (goalId) return savings.editGoal(goalId, { name, target, location, tenureMonths, emisPaidBefore, firstEmiDate, emiAmount });
    const result = await savings.addGoal({ name, target, location, kind, debtType, tenureMonths, emisPaidBefore, firstEmiDate, emiAmount });
    if (result?.success && startingAmount > 0) {
      await savings.addEntry(result.id, { type: 'add', amount: startingAmount, date: today(), note: 'Already saved' });
    }
    return result;
  }, [savings, goalId, kind]);

  // Logging an EMI payment doesn't touch the main transaction list on its
  // own — asked about afterward instead (useEmiExpenseConfirm above), same
  // reasoning as Budget's own checked lines: paying down a loan isn't
  // automatically a home-screen expense. Only offered for a brand-new debt
  // payment, not an edit (an edited entry already made its own choice the
  // first time) and not Savings (a deposit into a goal isn't spending).
  const emiConfirm = useEmiExpenseConfirm(savings, showToast);
  const submitMoney = useCallback(async (payload) => {
    const result = entry ? await savings.updateEntry(entry.id, payload) : await savings.addEntry(goalId, payload);
    // A new savings deposit or withdrawal gets the jar moment on the goal's page.
    if (result?.success && kind === 'savings' && !entry && goal?.target > 0) {
      ui.emitMoney({ goalId, type: payload.type, amount: payload.amount, savedBefore: goal.saved });
    }
    if (result?.success && kind === 'debt' && !entry && payload.type === 'add') {
      emiConfirm.schedule({ entryId: result.id, amount: payload.amount, date: payload.date, name: goal?.name || 'this loan' });
      // A pre-closure payment settles the loan outright — it doesn't wait
      // for the schedule's own EMI count to happen to catch up to it (see
      // useSavingsUI's openCloseEarly), since the real foreclosure amount
      // almost never matches `emisRemaining × emiAmount` exactly (a bank's
      // own fee or discount, not this app's schedule math).
      if (sheetData?.closeEarly) savings.setGoalCompleted(goalId, true);
    }
    return result;
  }, [savings, goalId, entry, kind, goal, emiConfirm, sheetData, ui]);

  // What the confirmation is about, looked up from the data rather than
  // carried in state so it can't go stale.
  const confirmGoal = confirmData ? goalList.find(g => g.id === confirmData.goalId) : null;
  const confirmEntry = confirmData?.kind === 'entry' && confirmGoal ? confirmGoal.entries.find(e => e.id === confirmData.entryId) : null;
  const [confirmError, setConfirmError] = useState('');
  useEffect(() => {
    if (confirmOpen) setConfirmError('');
  }, [confirmOpen]);

  let confirmTitle = '';
  let confirmMessage = '';
  if (confirmData?.kind === 'goal' && confirmGoal) {
    const what = confirmGoal.saved > 0
      ? `${confirmGoal.name} and its ${money(confirmGoal.saved)} history`
      : confirmGoal.entries.length > 0 ? `${confirmGoal.name} and its history` : confirmGoal.name;
    confirmTitle = copy.deleteTitle;
    confirmMessage = `${what} will be deleted. This can't be undone.`;
  } else if (confirmData?.kind === 'entry' && confirmEntry && confirmGoal) {
    confirmTitle = 'Delete entry?';
    confirmMessage = `This ${money(confirmEntry.amount)} ${kind === 'debt' ? 'payment' : (confirmEntry.type === 'add' ? 'deposit' : 'withdrawal')} will be removed from ${confirmGoal.name}.`;
  }

  // Both a goal and an entry are removed only once their dialog has actually
  // closed, not the moment "Delete" is tapped — so the row leaving the list
  // is something the user sees happen, rather than something that already
  // happened behind a dialog that's still on screen. `flushPendingDelete`
  // runs off the dialog's own "closed" and a timer behind it, in case that
  // event never comes; whichever fires first does it, once.
  const goalToDelete = useRef(null);
  const entryToDelete = useRef(null);
  const flushPendingDelete = useCallback(async () => {
    const goalId = goalToDelete.current;
    goalToDelete.current = null;
    if (goalId) savings.deleteGoal(goalId);
    const entryId = entryToDelete.current;
    entryToDelete.current = null;
    if (entryId) {
      const result = await savings.deleteEntry(entryId);
      // The entry's own payment might have been mirrored into Home's
      // expense list (see useEmiExpenseConfirm above) — deleteEntry takes
      // that expense with it, and this is the only place that actually
      // happened, so it's the only place that can tell the user about it.
      if (result?.removedTransaction) showToast?.('Also removed from your expenses');
    }
  }, [savings, showToast]);

  const handleConfirm = useCallback(() => {
    if (!confirmData) return;
    if (confirmData.kind === 'goal') {
      goalToDelete.current = confirmData.goalId;
      closeConfirm();
      setTimeout(flushPendingDelete, GOAL_DELETE_BACKSTOP_MS);
      return;
    }
    // An entry can be refused (a later withdrawal would go negative without
    // it) — the same check useSavings.deleteEntry itself makes, mirrored
    // here rather than called, since the actual delete is now deferred past
    // the point that check needs to happen at. Everything it needs is
    // already local (this goal's own entries), so it can run and, if
    // refused, say so before the dialog closes rather than after.
    const netWithout = confirmGoal.entries.reduce((sum, e) => (
      e.id === confirmData.entryId ? sum : sum + (e.type === 'add' ? e.amount : -e.amount)
    ), 0);
    if (netWithout < 0) {
      setConfirmError('Remove the withdrawals that depend on this first.');
      return;
    }
    entryToDelete.current = confirmData.entryId;
    closeConfirm();
    setTimeout(flushPendingDelete, GOAL_DELETE_BACKSTOP_MS);
  }, [confirmData, confirmGoal, closeConfirm, flushPendingDelete]);

  return (
    <>
      <GoalSheet
        open={sheetOpen && sheetData?.kind === 'goal'}
        onClose={closeSheet}
        onClosed={ui.markSheetClosed}
        goal={goal}
        initialName={sheetData?.initialName || ''}
        onSubmit={submitGoal}
        light={light}
        kind={kind}
      />
      <MoneySheet
        open={sheetOpen && sheetData?.kind === 'money'}
        onClose={closeSheet}
        onClosed={ui.markSheetClosed}
        goalName={goal?.name || ''}
        goal={goal}
        entry={entry}
        initialType={sheetData?.type || 'add'}
        maxWithdraw={goal?.saved || 0}
        onSubmit={submitMoney}
        closeEarly={!!sheetData?.closeEarly}
        light={light}
        kind={kind}
      />
      {/* Last, so it sits above the sheets as well as the page. */}
      <InlineConfirm
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        error={confirmError}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        onClosed={flushPendingDelete}
        light={light}
      />
      {/* Asked right after a new EMI payment is logged (see submitMoney
          above) — the payment itself is already recorded on the loan either
          way; this only decides whether it also becomes a real expense.
          Kind-gated at the call site (only debt ever calls `schedule`), so
          this stays inert for Savings. */}
      <ConfirmPill
        open={!!emiConfirm.pending}
        message={`Add ${money(emiConfirm.pending?.amount || 0)} for ${emiConfirm.pending?.name || 'this loan'} as expense`}
        onConfirm={emiConfirm.confirm}
        onDecline={emiConfirm.decline}
        light={light}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Net money moved in each month: adds minus withdrawals. The slider starts at
// the month of the goal's oldest entry and runs to the current one, which is
// where it opens (`initialIndex`), then carries PLACEHOLDER_MONTHS empty months
// on past it. `average` is the mean of the months up to the current one, empty
// ones included but not the placeholders, so it's what a month has come to on
// the whole.
function monthlyNets(entries) {
  const { month, year } = currentMonthYear();
  const nowIndex = year * 12 + month;
  const indexOf = (e) => monthIndexOf(e.date);
  const start = entries.length > 0 ? Math.min(...entries.map(indexOf)) : nowIndex;
  // The last real month: the current one, or a later one if an entry is dated
  // ahead, so no entry lands among the placeholders.
  const realCount = Math.max(nowIndex, ...entries.map(indexOf)) - start + 1;
  const count = realCount + PLACEHOLDER_MONTHS;

  const nets = new Array(count).fill(0);
  for (const e of entries) nets[indexOf(e) - start] += e.type === 'add' ? e.amount : -e.amount;

  const months = nets.map((net, i) => {
    const idx = start + i;
    return { name: `${MONTH_NAMES[idx % 12].slice(0, 3)} ${Math.floor(idx / 12)}`, net };
  });
  return {
    months,
    initialIndex: Math.max(0, Math.min(realCount - 1, nowIndex - start)),
    average: Math.round(nets.reduce((a, b) => a + b, 0) / realCount),
  };
}

// EMI debt's own circle tracker: a year x month grid of which EMIs are paid.
// A loan is a schedule, so this fills in schedule order — the first
// `emisPaid` months of it — rather than against the date any individual
// payment happens to carry. `emisPaid` is useSavings.js's own derived count
// (the EMIs that predate this app, plus every whole EMI's worth of money
// logged since), so a payment logged on the goal's page fills the next
// circle here, and a lump sum fills as many as it actually covers. Runs from
// the loan's own first EMI to either its last tenured month (tenureMonths
// set) or today, whichever is later, so a month with nothing paid yet still
// shows as "due" rather than being cut off.
function paymentGrid(firstEmiDate, tenureMonths, emisPaid = 0) {
  const { month: curMonth, year: curYear } = currentMonthYear();
  const curIndex = curYear * 12 + curMonth;
  const startIndex = monthIndexOf(firstEmiDate);
  const paidThroughIndex = startIndex + emisPaid - 1;
  const endIndex = tenureMonths ? startIndex + tenureMonths - 1 : Math.max(curIndex, paidThroughIndex);

  const startYear = Math.floor(startIndex / 12);
  const endYear = Math.floor(endIndex / 12);
  const years = [];
  for (let y = startYear; y <= endYear; y++) {
    const cells = [];
    for (let m = 0; m < 12; m++) {
      const idx = y * 12 + m;
      cells.push({ paid: idx <= paidThroughIndex, inRange: idx >= startIndex && idx <= endIndex });
    }
    years.push({ year: y, cells });
  }
  return { years };
}

// The label + round "+" row above the goal/loan list, same layout as
// BudgetPlan's own "Plan your next salary" row — a plus icon in a dim
// circle, not a labelled pill, since it sits right above the cards it adds
// to rather than floating at the bottom of the page unlabelled by context.
function ListHeader({ label, onPress, addLabel, light }) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
      {/* marginLeft matches the card's own inner padding below (see
          GoalCard's `padding: 16`), so this label lines up with the goal
          name text inside the card rather than sitting flush with the
          card's bare left edge — same alignment BudgetPlan's own header
          gives its "Plan your next salary" label. */}
      <Text style={{ fontSize: FONT.body, color: textColor(light).tertiary, marginLeft: 16 }}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: dim(light, 0.08) }}
      >
        <PlusIcon size={16} color={dim(light, 0.5)} />
      </Pressable>
    </View>
  );
}

// The round "+" at the bottom of a goal's page, opening the add / withdraw
// sheet.
function AddFab({ onPress, label }) {
  const insets = useSafeAreaInsets();
  return (
    <GlassPressable
      variant="pillActive"
      radius={9999}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[CENTERED, { position: 'absolute', left: '50%', marginLeft: -32, bottom: insets.bottom + 24, width: 64, height: 64 }]}
    >
      <PlusIcon size={28} color="#ffffff" />
    </GlassPressable>
  );
}

// One row of a savings goal's history. A row that arrives while the page is open
// (`animate`, read once, when it first appears) makes its own room: its height
// grows from nothing, so the rows under it are pushed down by one smooth motion
// rather than each being moved separately, and only then does its content fade
// in. Every other row is just the row. `height` is what to grow to — about a
// row's height; a little over is harmless, since the growth is a ceiling, not a
// fixed height.
function RevealRow({ animate, height, onMeasure, children }) {
  const play = useRef(animate).current;
  const grow = useSharedValue(play ? 0 : 1);
  const fade = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    grow.value = withTiming(1, { duration: ROW_SLIDE_MS, easing: Easing.inOut(Easing.cubic) });
    fade.value = withDelay(ROW_SLIDE_MS * 0.6, withTiming(1, { duration: NEW_ROW_FADE_MS, easing: Easing.out(Easing.cubic) }));
  }, [play, grow, fade]);
  const roomStyle = useAnimatedStyle(() => (play ? { maxHeight: grow.value * height, overflow: 'hidden' } : {}));
  const fadeStyle = useAnimatedStyle(() => (play ? { opacity: fade.value } : {}));
  return (
    <Animated.View style={roomStyle} onLayout={play ? undefined : onMeasure}>
      <Animated.View style={fadeStyle}>{children}</Animated.View>
    </Animated.View>
  );
}

function Divider({ inset = 16, light }) {
  return <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: inset, backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }} />;
}

// A first visit, kept to one question, one line of examples and one button.
function EmptyState({ onNew, light, kind = 'savings' }) {
  const copy = KIND_COPY[kind];
  return (
    <View className="items-center" style={{ paddingTop: 96, paddingHorizontal: 16 }}>
      <Text className="text-xl text-center" style={{ fontWeight: '400', color: light ? '#111111' : '#ffffff' }}>{copy.emptyTitle}</Text>
      <Text className="text-[16px] text-center" style={{ color: textColor(light).tertiary, marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
        {copy.emptyBody}
      </Text>
      <GlassPressable variant="active" radius={9999} onPress={() => onNew('')} style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}>
        <Text className="text-black text-[16px]" style={{ fontWeight: '500' }}>{copy.emptyAction}</Text>
      </GlassPressable>
    </View>
  );
}

// Same little date chip as a transaction row.
function DateChip({ dateStr, light }) {
  const { day, month } = dateBoxParts(dateStr);
  return (
    <View className="items-center justify-center w-8 h-8 rounded shrink-0" style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
      <Text className="text-[11px] font-semibold leading-none" style={{ color: dim(light, 0.7) }}>{day}</Text>
      <Text className="text-[8px] font-medium leading-none mt-0.5 tracking-tight" style={{ color: textColor(light).disabled }}>{month}</Text>
    </View>
  );
}

// Memoised, with stable handlers, so a page-level change (the celebration coming
// and going, a sheet holding) doesn't repaint every row. Swiping it left reveals
// a delete button, which asks `onDelete` (the caller confirms). It paints the
// card's own fill, or the button underneath would show through as it slides.
const HistoryRow = memo(function HistoryRow({ entry, onPress, onDelete, registerSwipeable, onSwipeOpen, onRowPress, light, kind = 'savings' }) {
  const copy = KIND_COPY[kind];
  const isAdd = entry.type === 'add';
  const { setSwipeableRef, handleDelete } = useSwipeDelete(entry.id, onDelete, registerSwipeable);
  // A tap that closed an open row is spent on that, so it doesn't also open the
  // entry behind the closing swipe.
  const handlePress = useCallback(() => {
    if (onRowPress?.()) return;
    onPress(entry.id);
  }, [entry.id, onPress, onRowPress]);

  return (
    <ReanimatedSwipeable
      ref={setSwipeableRef}
      friction={1.8}
      rightThreshold={32}
      overshootRight={false}
      renderRightActions={(_progress, drag) => <SwipeDeleteAction drag={drag} onDelete={handleDelete} label="Delete entry" />}
      onSwipeableWillOpen={() => onSwipeOpen?.(entry.id)}
    >
      <View style={{ backgroundColor: cardFill(light) }}>
        <GlassPressable variant="field" pressScale={false} onPress={handlePress} style={HISTORY_PAD} accessibilityRole="button">
          <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
            <View className="flex-row items-center flex-1" style={{ gap: 10 }}>
              <DateChip dateStr={entry.date} light={light} />
              <Text className="text-base" numberOfLines={1} style={{ flexShrink: 1, color: light ? '#111111' : '#ffffff' }}>
                {entry.note || (isAdd ? copy.addedLabel : copy.withdrewLabel)}
              </Text>
            </View>
            <Text className="text-base font-medium" style={{ color: isAdd ? POSITIVE : dim(light, 0.5) }}>
              {isAdd ? '+' : '−'}{money(entry.amount)}
            </Text>
          </View>
        </GlassPressable>
      </View>
    </ReanimatedSwipeable>
  );
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function GoalDetail({ goal: liveGoal, savings, ui, light, kind = 'savings', showToast }) {
  const copy = KIND_COPY[kind];
  const insets = useSafeAreaInsets();
  // A savings deposit or withdrawal is saved straight away, but the page keeps
  // showing the figures from before it until the jar moment has played: from
  // the moment the sheet reports the transaction (`moneyEvent`) until the
  // moment's dark wash starts to leave (`jarHold`). Everything below reads
  // `goal`, which is the held copy during that stretch.
  const { moneyEvent, clearMoney, sheetClosed } = ui;
  const [jarHold, setJarHold] = useState(false);
  // After the jar: null (everything live) or the part of the page now updating —
  // 'bar' (the status card), 'chart' (the monthly savings card), 'row' (the
  // history). Each part stays on its old figures until its turn.
  const [reveal, setReveal] = useState(null);
  // The ids of the history as it stood before the transaction, so the new row can
  // be left out until its turn and then faded in.
  const [baseIds, setBaseIds] = useState(null);
  const holding = kind === 'savings' && (jarHold || (!!moneyEvent && moneyEvent.goalId === liveGoal.id));
  const heldRef = useRef(liveGoal);
  if ((!holding && reveal === null) || heldRef.current.id !== liveGoal.id) heldRef.current = liveGoal;
  const staged = (part) => !holding && (reveal === null || (part === 'bar') || (part === 'chart' && reveal !== 'bar') || (part === 'row' && reveal === 'row'));
  const goal = staged('bar') ? liveGoal : heldRef.current;
  const chartGoal = staged('chart') ? liveGoal : heldRef.current;
  const rowLive = staged('row');
  // Held back while the celebration is up, so the "goal reached" prompt comes
  // in once it has been dismissed rather than under it.
  const [celebrating, setCelebrating] = useState(false);
  // Celebration's own Modal is mounted only once this is true — see the
  // `first` block below for why that's not the same moment as `celebrating`
  // itself.
  const [celebrationReady, setCelebrationReady] = useState(false);
  const celebrationTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(celebrationTimerRef.current), []);
  // The slide-to-pay sequence for an EMI loan (see useEmiPayFlow): the paid
  // moment, and the figures the status line and tracker show while it plays.
  const emiConfirm = useEmiExpenseConfirm(savings, showToast);
  const { moment, endMoment, payEmi, payHold, barG, dotG, shownEntries: emiShownEntries, isNewEntry: emiIsNewEntry } = useEmiPayFlow({ goal, savings, emiConfirm });
  // The history: a loan's own flow decides what it shows; a savings goal's new
  // row waits for its turn (see `reveal`).
  const shownEntries = kind === 'savings' && baseIds && !rowLive ? goal.entries.filter((e) => baseIds.has(e.id)) : emiShownEntries;
  // A history row's height, as last measured, for a new row to grow to.
  const rowHeightRef = useRef(DEFAULT_ROW_H);
  const measureRow = useCallback((e) => { rowHeightRef.current = e.nativeEvent.layout.height; }, []);
  const isNewEntry = useCallback((id) => emiIsNewEntry(id) || (kind === 'savings' && !!baseIds && !baseIds.has(id)), [emiIsNewEntry, kind, baseIds]);
  // The savings jar moment, started by the sheet that logged a deposit or
  // withdrawal (see useSavingsUI's emitMoney) once that sheet has closed. A
  // deposit that takes the goal to its target fills the jar and says so —
  // savings never uses the confetti celebration.
  const [jar, setJar] = useState(null);
  const jarTimerRef = useRef(null);
  const jarFailsafeRef = useRef(null);
  useEffect(() => {
    if (!moneyEvent || moneyEvent.goalId !== liveGoal.id || !sheetClosed) return;
    clearMoney();
    if (kind !== 'savings') return;
    const savedAfter = Math.max(0, moneyEvent.savedBefore + (moneyEvent.type === 'add' ? moneyEvent.amount : -moneyEvent.amount));
    // A deposit that takes the goal to its target completes the jar.
    const complete = moneyEvent.type === 'add' && moneyEvent.savedBefore < liveGoal.target && savedAfter >= liveGoal.target;
    setJarHold(true);
    setBaseIds(new Set(heldRef.current.entries.map((e) => e.id)));
    // Never leave the page holding old figures if the moment doesn't play.
    clearTimeout(jarFailsafeRef.current);
    jarFailsafeRef.current = setTimeout(() => { setJarHold(false); setBaseIds(null); }, JAR_HOLD_FAILSAFE_MS);
    // The jar is a native Modal, and the sheet that logged the money is one
    // too, only just finishing its own dismissal: presenting one while the other
    // is still closing silently never happens on iOS (see the same wait before
    // Celebration, below). So it starts a beat later.
    jarTimerRef.current = setTimeout(
      () => setJar({ type: moneyEvent.type, name: liveGoal.name, savedBefore: moneyEvent.savedBefore, savedAfter, target: liveGoal.target, amount: moneyEvent.amount, complete }),
      JAR_START_DELAY_MS
    );
  }, [moneyEvent, sheetClosed, liveGoal.id, liveGoal.name, liveGoal.target, kind, clearMoney]);
  const revealTimerRef = useRef(null);
  useEffect(() => () => { clearTimeout(jarTimerRef.current); clearTimeout(jarFailsafeRef.current); clearTimeout(revealTimerRef.current); }, []);
  // The jar has gone: the page now shows what changed, a part at a time.
  const endJar = useCallback(() => {
    clearTimeout(jarFailsafeRef.current);
    setJar(null);
    clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setJarHold(false);
      setReveal('bar');
      revealTimerRef.current = setTimeout(() => {
        setReveal('chart');
        revealTimerRef.current = setTimeout(() => {
          setReveal('row');
          revealTimerRef.current = setTimeout(() => { setReveal(null); setBaseIds(null); }, REVEAL_ROW_MARK_MS);
        }, REVEAL_STEP_MS);
      }, REVEAL_STEP_MS);
    }, REVEAL_START_MS);
  }, []);
  const showReached = goal.reached && !goal.completedAt && !celebrating;
  // A debt goal is one of two shapes now (see useSavings.js's own comment
  // on `debtType`) — an EMI/Loan (fixed schedule, the circle tracker below)
  // or Flexible (no schedule, tracked the same plain entries-only way a
  // savings goal is, just read backwards — see MonthSlider's own caller
  // further down reusing Savings' exact chart for it).
  const isEmiDebt = kind === 'debt' && goal.debtType === 'emi';
  const isFlexibleDebt = kind === 'debt' && goal.debtType === 'flexible';
  // Only the non-EMI chart reads this.
  const chart = useMemo(() => (isEmiDebt ? null : monthlyNets(chartGoal.entries)), [isEmiDebt, chartGoal.entries]);
  const grid = useMemo(
    () => (isEmiDebt && goal.firstEmiDate ? paymentGrid(goal.firstEmiDate, goal.tenureMonths, dotG.emisPaid) : null),
    [isEmiDebt, goal.firstEmiDate, goal.tenureMonths, dotG.emisPaid]
  );
  const showChart = isEmiDebt ? !!grid : chartGoal.entries.length > 0;

  // Whether THIS cycle's EMI is already behind the loan — the schedule is a
  // plain month index (see useSavings.js's own `emisPaid`), not a calendar,
  // so "paid for the current month" is read off `nextEmiDate` rather than
  // tracked on its own: once the next due EMI's own month is AFTER the
  // current one, the schedule has already caught up through this month.
  // `goal.nextEmiDate` is null once there's nothing left to pay at all
  // (loan cleared), which is its own state below, not this one.
  const curMonthIndex = useMemo(() => {
    const { month, year } = currentMonthYear();
    return year * 12 + month;
  }, []);
  const emiPaidThisCycle = !!goal.nextEmiDate && monthIndexOf(goal.nextEmiDate) > curMonthIndex;

  const openCloseEarly = useCallback(() => ui.openCloseEarly(goal.id), [ui, goal.id]);

  // Celebrates the moment the goal reaches its target while this page is open.
  // A goal that was already reached when its page opened does not (nor one whose
  // page has just taken over from another goal's — this component is reused), so
  // what's compared is the same goal's `reached` from one render to the next.
  // Worked out during render, not in an effect, so the prompt above never gets a
  // frame on screen before the celebration covers it.
  //
  // Two ways in, because there are two ways a goal gets done: its own target
  // or schedule being met (`reached`), and it being marked done by hand. Only
  // the first used to count, which left the second with no moment at all —
  // and a loan settled early, or one already paid off by the time its page is
  // opened, arrives ONLY by that second route, so clearing it was silent.
  // `celebrated` latches so a goal that hits its target and is then marked
  // done still gets exactly one.
  const completed = !!goal.completedAt;
  const [seen, setSeen] = useState({ id: goal.id, reached: goal.reached, completed, celebrated: false });
  if (seen.id !== goal.id || seen.reached !== goal.reached || seen.completed !== completed) {
    const sameGoal = seen.id === goal.id;
    const first = sameGoal && !seen.celebrated
      && ((goal.reached && !seen.reached && !completed) || (completed && !seen.completed));
    // Reopening a done loan (completed -> not completed) lets it celebrate
    // again the next time it is completed.
    const reopened = seen.completed && !completed;
    setSeen({ id: goal.id, reached: goal.reached, completed, celebrated: sameGoal && !reopened && (seen.celebrated || first) });
    if (first && kind !== 'savings') {
      // `celebrating` flips on THIS render, synchronously, so `showReached`
      // above never gets a frame on screen first — that part still happens
      // exactly as the comment above describes. Mounting Celebration's own
      // Modal is held back a beat longer, on purpose: crossing the final EMI
      // or deposit goes through MoneySheet's AddModal, which is ALSO a
      // native `<Modal>` — and this transition lands on the exact same
      // render as that one finishing its own close animation and telling
      // its native Modal to dismiss (see AddModal's onClosed, called right
      // alongside its own cleanup). Presenting one native Modal while
      // another is mid-dismissal is a real iOS/UIKit race, not a React one —
      // no error, nothing to catch, the second presentation just silently
      // never happens. A short delay here is what actually fixes "the
      // celebration doesn't show at all" rather than papering over a crash
      // that was never there. Marking a goal done by hand has no modal to
      // race (it's a plain button in this same page), so this is pure
      // safety margin there, not a fix for anything broken on that path.
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => setCelebrationReady(true), 300);
      setCelebrating(true);
    }
  }
  // Tied to `celebrationReady`, not `celebrating` — the buzz should land
  // with the Modal actually appearing, not 300ms ahead of it.
  useEffect(() => {
    if (celebrationReady) hapticAdded();
  }, [celebrationReady]);
  const endCelebration = useCallback(() => {
    clearTimeout(celebrationTimerRef.current);
    setCelebrating(false);
    setCelebrationReady(false);
  }, []);
  const swipes = useSwipeGroup();
  const { openEntry, openDeleteEntry } = ui;
  const editEntry = useCallback((entryId) => openEntry(goal.id, entryId), [openEntry, goal.id]);
  const deleteEntry = useCallback((entryId) => openDeleteEntry(goal.id, entryId), [openDeleteEntry, goal.id]);

  return (
    <View style={{ flex: 1 }}>
    {/* Everything down to the History label stays put; only the history below
        it scrolls, the way the transaction list does on the home screen. */}
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 8 }}>
      {/* The name, with a pen beside it — both open the edit sheet. */}
      <View className="flex-row items-center justify-center" style={{ marginTop: 4, gap: 10, paddingHorizontal: 24 }}>
        {/* An empty box as wide as the pen, so the title itself sits at the
            true centre of the page and the pen hangs off its right side. */}
        <View style={{ width: 16 }} />
        <Pressable
          onPress={() => ui.openEditGoal(goal.id)}
          style={{ flexShrink: 1 }}
          accessibilityRole="button"
          accessibilityLabel={copy.editGoalLabel}
        >
          {/* EMI debt: the amount below is the focus, so the name steps back. */}
          <Text numberOfLines={1} style={isEmiDebt
            ? { fontSize: FONT.body, fontWeight: '500', color: textColor(light).secondary }
            : { fontSize: FONT.title, fontWeight: '600', color: light ? '#111111' : '#ffffff' }}
          >{goal.name}</Text>
        </Pressable>
        {/* The same sheet the title opens, but findable without knowing the
            title is tappable. */}
        <Pressable
          onPress={() => ui.openEditGoal(goal.id)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={copy.editGoalLabel}
        >
          <EditIcon size={16} color={textColor(light).tertiary} />
        </Pressable>
      </View>
      {!!goal.location && (
        <Text className="text-[13px] text-center" numberOfLines={1} style={{ marginTop: 4, color: textColor(light).tertiary }}>
          {kind === 'debt' ? 'from' : 'in'} {goal.location}
        </Text>
      )}

      {isEmiDebt ? (
        // An EMI loan is just the one figure on the page background — progress
        // lives in the tracker below, the loan's other numbers in the tracker's
        // footer and the edit sheet, and the monthly EMI on the slider.
        <View style={{ marginTop: 24, marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: FONT.display, fontWeight: '400', letterSpacing: -1.5, color: light ? '#111111' : '#ffffff', ...TABULAR }}>{money(barG.remaining)}</Text>
          <Text style={{ fontSize: FONT.caption, color: textColor(light).tertiary, marginTop: 6 }}>left to pay</Text>
        </View>
      ) : (
        // Savings and flexible debt: the same card shape as GoalCard's list row
        // — the figure with its "of X" caption on one baseline, the percent
        // beside it, then the bar. A debt's figure is what's left, a goal's is
        // what's saved.
        <View style={{ marginTop: 16, marginBottom: 16 }}>
          <Card light={light}>
            <View style={{ padding: 20 }}>
              <View className="flex-row items-baseline justify-between" style={{ gap: 12, marginBottom: 12 }}>
                <View className="flex-row items-baseline flex-1" style={{ gap: 6 }}>
                  <Text style={{ fontSize: FONT.amount, fontWeight: '600', color: light ? '#111111' : '#ffffff' }}>
                    {money(kind === 'debt' ? barG.remaining : goal.saved)}
                  </Text>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: FONT.caption, color: light ? '#111111' : '#ffffff' }}>
                    of {money(goal.target)}
                  </Text>
                </View>
                <Text className="text-[13px]" numberOfLines={1} style={{ color: light ? '#111111' : '#ffffff' }}>{barG.percent}% {kind === 'debt' ? 'paid' : 'saved'}</Text>
              </View>
              <ProgressBar percent={barG.percent} duration={900} height={8} light={light} trackColor="rgba(74,222,128,0.12)" />
            </View>
          </Card>
        </View>
      )}

      {goal.completedAt ? (
        <View className="flex-row items-center justify-center" style={{ gap: 10, marginTop: 20 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <CheckIcon size={16} color={POSITIVE} />
            <Text className="text-base" style={{ color: POSITIVE }}>{copy.completedLabel}</Text>
          </View>
          <Pressable onPress={() => savings.setGoalCompleted(goal.id, false)} hitSlop={8} accessibilityRole="button">
            <Text className="text-base" style={{ color: textColor(light).disabled }}>Reopen</Text>
          </Pressable>
        </View>
      ) : showReached ? (
        <Animated.View entering={FadeIn.duration(SWAP_MS)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, borderRadius: CARD_RADIUS, ...SMOOTH, backgroundColor: 'rgba(74,222,128,0.10)' }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <CheckIcon size={16} color={POSITIVE} />
            <Text className="text-base" style={{ color: POSITIVE }}>{copy.reachedLabel}</Text>
          </View>
          <Pressable onPress={() => savings.setGoalCompleted(goal.id, true)} hitSlop={8} accessibilityRole="button">
            <Text className="text-base font-medium" style={{ color: light ? '#111111' : '#ffffff' }}>{copy.markDoneLabel}</Text>
          </Pressable>
        </Animated.View>
      ) : null}

    </View>

    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      onScrollBeginDrag={swipes.closeOpen}
      // The extra clearance is only for the floating "+" (see its own
      // comment on why EMI debt no longer has one) — without it, this would
      // just be leaving a gap under the history for a button that isn't
      // there.
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + (isEmiDebt ? 24 : 120) }}
    >
      {/* Net per month from the first entry on, as a row that slides under a
          fixed centre — the month in the middle is the one read out. Not shown
          until there is something to plot. `key` reopens it on the current
          month when another goal's page takes over this one.

          Scrolls with the history below it rather than sitting in the fixed
          header above — a debt with a long tenure (120+ months) draws one
          full row per year (see PaymentGrid's own comment), and a fixed-
          height card that tall was squeezing the actual payment history
          below it down to almost nothing on long loans. Nothing about the
          card itself changed, only where it lives. */}
      {showChart && (
        <View style={{ marginTop: 12 }}>
          <Text className="text-[11px] font-medium uppercase tracking-wider px-5 mb-2" style={{ color: textColor(light).disabled }}>
            {isFlexibleDebt ? 'Monthly payments' : copy.monthlyTitle}
          </Text>
          <Card light={light}>
            {isEmiDebt ? (
              // EMIs remaining, the circle tracker (one row per year), then
              // the loan's total and monthly figures.
              <View style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
                {dotG.emisRemaining != null && (
                  <Text style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: FONT.amount, fontWeight: '600', letterSpacing: -0.5, color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.90)' }}>
                      {dotG.emisRemaining}
                    </Text>
                    <Text style={{ fontSize: FONT.caption, fontWeight: '400', color: textColor(light).tertiary }}>
                      {' '}EMI remaining
                    </Text>
                  </Text>
                )}
                <PaymentGrid years={grid.years} light={light} />
                <View className="flex-row items-center justify-between" style={{ marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: dim(light, 0.08) }}>
                  {goal.target > 0 && (
                    <Text className="text-[13px]" style={{ color: textColor(light).tertiary }}>
                      Total loan <Text style={{ color: textColor(light).secondary }}>{money(goal.target)}</Text>
                    </Text>
                  )}
                  {goal.emiAmount != null && (
                    <Text className="text-[13px]" style={{ color: textColor(light).tertiary }}>
                      <Text style={{ color: textColor(light).secondary }}>{money(goal.emiAmount)}</Text> / month
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              // Flexible debt reuses this exact chart — no schedule of its
              // own, so it's tracked (and shown) the same plain way a
              // savings goal is, just read backwards. The average sits at
              // the top left; the slider below has no side padding, so its
              // bars slide right out to the card's edge.
              <View style={{ paddingVertical: 16 }}>
                <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
                  <Text style={{ color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.90)', fontSize: FONT.amount, fontWeight: '600', letterSpacing: -0.5 }}>
                    {chart.average < 0 ? '−' : ''}{money(Math.abs(chart.average))}
                  </Text>
                  <Text className="text-[13px]" style={{ color: dim(light, 0.5), marginTop: 2 }}>average per month</Text>
                </View>
                <MonthSlider key={goal.id} months={chart.months} initialIndex={chart.initialIndex} light={light} />
              </View>
            )}
          </Card>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-2" style={{ marginTop: showChart ? 28 : 12 }}>
        <Text className="text-[11px] font-medium uppercase tracking-wider px-4" style={{ color: textColor(light).disabled }}>
          {copy.historyTitle}
        </Text>
        {/* Rare and weighty, so it lives out of the way up here rather than
            beside the slider — reachable, never the easy tap. Hidden once the
            loan is done. */}
        {isEmiDebt && !goal.completedAt && !goal.reached && (
          <Pressable onPress={openCloseEarly} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close loan early" style={{ paddingRight: 16 }}>
            <Text style={{ fontSize: FONT.caption, fontWeight: '500', color: textColor(light).secondary }}>Close early</Text>
          </Pressable>
        )}
      </View>

      {shownEntries.length === 0 ? (
        <Text className="text-base px-4" style={{ color: textColor(light).tertiary, marginTop: 12, opacity: 0.6 }}>{copy.historyEmpty}</Text>
      ) : (
        <Card light={light}>
          {shownEntries.map((e, i) => {
            const row = (
              <>
                <HistoryRow
                  entry={e}
                  onPress={editEntry}
                  onDelete={deleteEntry}
                  registerSwipeable={swipes.registerSwipeable}
                  onSwipeOpen={swipes.onSwipeOpen}
                  onRowPress={swipes.onRowPress}
                  light={light}
                  kind={kind}
                />
                {i < shownEntries.length - 1 && <Divider inset={16} light={light} />}
              </>
            );
            return kind === 'savings' ? (
              <RevealRow key={e.id} animate={isNewEntry(e.id)} height={rowHeightRef.current} onMeasure={measureRow}>{row}</RevealRow>
            ) : (
              <Animated.View key={e.id} entering={isNewEntry(e.id) ? FadeIn.duration(900) : undefined}>{row}</Animated.View>
            );
          })}
        </Card>
      )}
    </ScrollView>
    {/* EMI debt's one real action, pinned to the bottom where a thumb rests:
        slide to log this month's EMI. Hidden once the loan is done
        (`reached`/`completedAt` have their own banner above). */}
    {isEmiDebt && !goal.completedAt && !goal.reached && (
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
        <SlideToPay
          label={`Slide to pay ${money(goal.emiAmount || 0)}`}
          paidLabel={goal.nextEmiDate ? `EMI paid · next ${formatDateFull(goal.nextEmiDate)}` : 'EMI paid'}
          paid={(emiPaidThisCycle && !payHold) || !(goal.emiAmount > 0)}
          onComplete={payEmi}
          light={light}
        />
      </View>
    )}
    {/* EMI debt has no floating "+" any more — its slide-to-pay bar (and Close
        early, beside the Payments label) are its actions. Savings and
        Flexible debt have no schedule to read a specific action off, so
        this stays their one way in. */}
    {!isEmiDebt && <AddFab onPress={() => ui.openMoney(goal.id, 'add')} label={copy.fabLabel} />}
    {/* Decoration: if it fails it goes away, and the "goal reached" prompt it was
        holding back comes straight in. `celebrationReady`, not `celebrating`
        — see the `first` block above for why mounting this Modal waits a
        beat past the moment `celebrating` itself flips. */}
    {celebrationReady && (
      <ErrorBoundary onError={endCelebration}>
        <Celebration {...celebrationCopy(goal, kind, copy)} onDone={endCelebration} />
      </ErrorBoundary>
    )}
    {jar && (
      <ErrorBoundary onError={endJar}>
        <JarMoment {...jar} light={light} onDone={endJar} />
      </ErrorBoundary>
    )}
    {moment && (
      <ErrorBoundary onError={endMoment}>
        <PaidMoment {...moment} light={light} onDone={endMoment} />
      </ErrorBoundary>
    )}
    {/* Asked after a slide-to-pay payment (see useEmiPayFlow) — the same pill
        and follow-up SavingsSheetsHost's own MoneySheet submit offers. */}
    <ConfirmPill
      open={!!emiConfirm.pending}
      message={`Add ${money(emiConfirm.pending?.amount || 0)} for ${emiConfirm.pending?.name || 'this loan'} as expense`}
      onConfirm={emiConfirm.confirm}
      onDecline={emiConfirm.decline}
      light={light}
    />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function SavingsSection({ savings, ui, active, light = false, detailGoalId, onOpenGoal, onCloseGoal, kind = 'savings', showToast }) {
  const copy = KIND_COPY[kind];
  const insets = useSafeAreaInsets();
  // What is shown is held while a sheet is open, and let go once it has
  // finished closing. The held copy is whatever was current the last time no
  // sheet was up, i.e. the moment before the one now open appeared.
  const liveView = kind === 'debt'
    ? { goals: savings.debts, completedGoals: savings.completedDebts, allGoals: savings.allDebts, totalSaved: savings.totalOwed }
    : { goals: savings.goals, completedGoals: savings.completedGoals, allGoals: savings.allGoals, totalSaved: savings.totalSaved };
  const heldViewRef = useRef(liveView);
  if (ui.sheetClosed) heldViewRef.current = liveView;
  // Already closest-to-done-first — useSavings' own splitByStatus sorts
  // `active` by the exact saved/target ratio (see its own comment), so
  // re-sorting here by the rounded `percent` instead would just be redoing
  // that work with a coarser tie-break.
  const { goals, completedGoals, allGoals, totalSaved } = ui.sheetClosed ? liveView : heldViewRef.current;
  const [showCompleted, setShowCompleted] = useState(false);

  // Cheap, and the only way this reflects changes made elsewhere (Erase Data
  // on the account screen, another device) without waiting for the next
  // Dashboard focus.
  useEffect(() => {
    if (active) savings.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // List <-> detail crossfade. The detail layer keeps rendering the last goal
  // while it fades out, so it doesn't blank halfway through.
  const detailOpen = detailGoalId != null;
  const detailProgress = useSharedValue(0);
  useEffect(() => {
    detailProgress.value = withTiming(detailOpen ? 1 : 0, { duration: SWAP_MS, easing: Easing.out(Easing.cubic) });
  }, [detailOpen, detailProgress]);
  const listStyle = useAnimatedStyle(() => ({ opacity: 1 - detailProgress.value }));
  const detailStyle = useAnimatedStyle(() => ({ opacity: detailProgress.value }));

  const lastDetailIdRef = useRef(detailGoalId);
  if (detailGoalId != null) lastDetailIdRef.current = detailGoalId;
  const detailGoal = allGoals.find(g => g.id === lastDetailIdRef.current) || null;

  // A goal can disappear while its detail is open — deleted from the sheet, or
  // wiped by Erase Data / another device via a refresh. Nothing to show then.
  const detailMissing = detailGoalId != null && !allGoals.some(g => g.id === detailGoalId);
  useEffect(() => {
    if (detailMissing) onCloseGoal();
  }, [detailMissing, onCloseGoal]);

  const isEmpty = goals.length === 0 && completedGoals.length === 0;

  const swipes = useSwipeGroup();
  const { openDeleteGoal } = ui;
  const cardProps = { onPress: onOpenGoal, onDelete: openDeleteGoal, registerSwipeable: swipes.registerSwipeable, onSwipeOpen: swipes.onSwipeOpen, onCardPress: swipes.onRowPress, light };

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, listStyle]} pointerEvents={detailOpen ? 'none' : 'auto'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={swipes.closeOpen}
          // GUTTER (20), not 16 — matches the goal detail page's own
          // paddingHorizontal below, and the app's screen edge everywhere
          // else. Was the one screen still at 16.
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: insets.bottom + 40 }}
        >
          {isEmpty ? (
            <EmptyState onNew={ui.openNewGoal} light={light} kind={kind} />
          ) : (
            <>
              <View className="items-center" style={{ paddingTop: 16, paddingBottom: 22 }}>
                <Text className="text-[13px]" style={{ color: textColor(light).tertiary, marginBottom: 6 }}>{copy.sectionTotal}</Text>
                {/* Same size/weight as Home's own headline figure
                    (SummaryCard's HEADLINE_TEXT_STYLE) — this is the same
                    kind of number, just on a different screen. */}
                <Text
                  style={{ fontSize: FONT.display, lineHeight: 52, fontWeight: '400', letterSpacing: -1.75, color: light ? '#111111' : '#ffffff', ...TABULAR }}
                >
                  {money(totalSaved)}
                </Text>
              </View>

              <ListHeader label={copy.listLabel} onPress={() => ui.openNewGoal('')} addLabel={copy.newLabel} light={light} />

              {goals.map(g => <GoalCard key={g.id} goal={g} {...cardProps} />)}

              {completedGoals.length > 0 && (
                <>
                  <Pressable
                    onPress={() => setShowCompleted(v => !v)}
                    className="flex-row items-center justify-between px-1"
                    style={{ paddingVertical: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${copy.completedLabel} ${kind === 'debt' ? 'loans' : 'goals'}`}
                  >
                    <Text className="text-[13px]" style={{ color: textColor(light).tertiary }}>{copy.completedLabel} · {completedGoals.length}</Text>
                    <View style={{ transform: [{ rotate: showCompleted ? '90deg' : '0deg' }] }}>
                      <ChevronRight color={textColor(light).disabled} />
                    </View>
                  </Pressable>
                  {showCompleted && (
                    <Animated.View entering={FadeIn.duration(SWAP_MS)}>
                      {completedGoals.map(g => <GoalCard key={g.id} goal={g} {...cardProps} done />)}
                    </Animated.View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, detailStyle]} pointerEvents={detailOpen ? 'auto' : 'none'}>
        {detailGoal && <GoalDetail goal={detailGoal} savings={savings} ui={ui} light={light} kind={kind} showToast={showToast} />}
      </Animated.View>
    </View>
  );
}

export default memo(SavingsSection);
