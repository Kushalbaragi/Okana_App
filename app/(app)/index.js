import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import { useBudget } from '../../hooks/useBudget';
import { useSubscription } from '../../hooks/useSubscription';
import { getSubscriptionDisplayStatus } from '../../utils/trial';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import TransactionList from '../../components/TransactionList';
import AddModal from '../../components/AddModal';
import SpendCalendarModal from '../../components/SpendCalendarModal';
import MonthlyRecapModal from '../../components/MonthlyRecapModal';
import BudgetSetupModal from '../../components/BudgetSetupModal';
import { UpdateSheet } from '../../components/UpdateSheet';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { AnimatedModal } from '../../components/AnimatedModal';
import { TourHint } from '../../components/TourHint';
import { useTourStep } from '../../hooks/useTourStep';
import { PlusIcon } from '../../components/icons';
import { PILL_ACTIVE_COLOR } from '../../components/Glass';
import { currentMonthYear, today, formatCurrency } from '../../utils/format';
import { getMonthlyRecapSlides, hasAnyRecapData, prevMonthYear, MONTH_NAMES } from '../../utils/monthlyRecap';

// One-flag experiment: a light theme for just this screen (Header,
// SummaryCard, TransactionList). Flip back to false to fully revert —
// every other screen is untouched regardless of this value.
const LIGHT_HOME = false;
const HOME_BG = LIGHT_HOME ? '#FAFAF8' : '#000000';

// Mirrors the local AsyncStorage "shown" tracking server-side, so the
// check-monthly-summary cron (which has no access to any device's
// AsyncStorage) knows not to send the 9am nudge to someone who's already
// opened the recap. Best-effort — a failed write here only means next
// month's cron might notify someone who didn't strictly need it, not
// something worth blocking the recap on.
async function markRecapViewedServerSide(userId, monthId) {
  try {
    await supabase.from('monthly_summary_status').upsert(
      { user_id: userId, month_id: monthId, viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,month_id' },
    );
  } catch {
    // best-effort, see comment above
  }
}

// The calendar's "Monthly Summary" CTA is only visible on the day the
// recap is actually seen, not the whole rest of the month — this stamps
// that day so the next app-open can check it.
async function markRecapAvailableToday(userId) {
  try {
    await AsyncStorage.setItem(`okana_recap_available_date_${userId}`, today());
  } catch {
    // best-effort
  }
}

// AsyncStorage's own "already shown this month" flag lives only on-device —
// a reinstall wipes it, which used to make the recap pop up again for a
// month the account had already seen it for. The server-side write
// markRecapViewedServerSide already makes below is the durable record (tied
// to the account, not the install); this reads it back as a fallback only
// when the local flag is missing, so a normal (non-reinstalled) app open
// never pays the network round trip.
async function hasViewedRecapServerSide(userId, monthId) {
  try {
    const { data } = await supabase
      .from('monthly_summary_status')
      .select('viewed_at')
      .eq('user_id', userId)
      .eq('month_id', monthId)
      .maybeSingle();
    return !!data?.viewed_at;
  } catch {
    return false;
  }
}

export default function Dashboard() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { transactions, loading: txLoading, addTransaction, editTransaction, deleteTransaction, refresh: refreshTransactions } = useTransactions();
  const budget = useBudget(user, transactions);
  const { subscription, loading: subLoading, refresh: refreshSubscription } = useSubscription(user);
  const trialInfo = useMemo(() => getSubscriptionDisplayStatus(subscription, today()), [subscription]);
  const posthog = usePostHog();
  // Fires once, exactly on the transition into 'expired' — not on every
  // render while already expired, and not on a cold launch that's already
  // expired (there's no "previous" status to compare against yet, so a
  // genuinely-new transition can't be told apart from "was always this
  // way"). Anchored here specifically (not account.js/subscription.js,
  // which also call useSubscription) because Dashboard is the one screen
  // guaranteed to mount exactly once per session — see the comment below
  // on why — so this can't double-fire across multiple mounted instances.
  const prevSubStatusRef = useRef(undefined);
  useEffect(() => {
    const prev = prevSubStatusRef.current;
    prevSubStatusRef.current = trialInfo.status;
    if (prev != null && prev !== 'expired' && trialInfo.status === 'expired') {
      posthog?.capture('subscription_expired', { was_trial: !!subscription?.is_trial });
    }
  }, [trialInfo.status, subscription, posthog]);
  const transactionListRef = useRef(null);
  const { showUpdate, dismiss: dismissUpdate } = useAppUpdate();

  // Scale-in-and-fade on mount — Dashboard only ever mounts once per app
  // session (it stays mounted underneath Settings/Subscription when
  // navigating there and back, standard stack behavior), so this plays on
  // the actual app-open moment only, not on every visit here.
  const entranceProgress = useSharedValue(0);
  useEffect(() => {
    entranceProgress.value = withTiming(1, { duration: 480, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }, []);

  // Home stays static while the Calendar page slides in/out on top of it —
  // an earlier version also pushed Home off-screen in lockstep (a
  // synchronized swap, matching how Settings pushed via the Stack navigator
  // moves both screens together), but that read as glittery/janky rather
  // than smooth, so it was removed. Only SpendCalendarModal's own page
  // animates now.
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [{ scale: 0.94 + entranceProgress.value * 0.06 }],
  }));

  // Erase Data / other changes made from Account (a separate stacked screen)
  // update Supabase directly without touching this screen's own useTransactions/
  // useBudget state — refetch both whenever Dashboard regains focus so
  // returning here reflects them instead of showing stale, pre-erase data.
  // Subscription is refreshed here too — useSubscription only fetches once
  // on mount, so without this, completing a purchase on the Subscription
  // screen and navigating back would leave Dashboard's own `subscription`
  // (and the Add-transaction gate that reads it) stuck on whatever it was
  // when Dashboard first mounted, still showing "subscription required"
  // even though the purchase succeeded.
  useFocusEffect(
    useCallback(() => {
      refreshTransactions();
      budget.refresh();
      refreshSubscription();
    }, [refreshTransactions, budget.refresh, refreshSubscription])
  );

  const [calendarOpen, setCalendarOpen] = useState(false);

  const { month: currMonth, year: currYear } = currentMonthYear();

  const [chartTab, setChartTab] = useState('expense');
  const [timeRange, setTimeRange] = useState('month');
  const [year, setYear] = useState(currYear);
  const [selectedMonth, setSelectedMonth] = useState(currMonth);
  // { year, month } | null — month is null when the selection is a whole
  // year (5y-yearly mode) and 0-11 when it's a specific month (5y-monthly).
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  const [recapOpen, setRecapOpen] = useState(false);
  const [recapSlides, setRecapSlides] = useState([]);
  const [recapMonthName, setRecapMonthName] = useState('');
  const [recapAvailable, setRecapAvailable] = useState(false);

  const [budgetSetupOpen, setBudgetSetupOpen] = useState(false);
  const [budgetSetupPending, setBudgetSetupPending] = useState(false);
  const [dailyPopupsResolved, setDailyPopupsResolved] = useState(false);

  const [proRequired, setProRequired] = useState(false);

  const [budgetCrossedOpen, setBudgetCrossedOpen] = useState(false);
  const [budgetCrossedOverAmount, setBudgetCrossedOverAmount] = useState(0);

  // Tracks whether AddModal's own native <Modal> has actually finished
  // closing (not just whether `modalOpen` is false) — see addModalClosed
  // usage below for why this matters.
  const [addModalClosed, setAddModalClosed] = useState(true);

  // Adding or editing a transaction updates `transactions` optimistically
  // the instant it's called — well before AddModal's own close animation
  // even starts, since the sheet is still fully open at that point. Left
  // alone, that means the amount/chart/list animations that are SUPPOSED to
  // be the reveal all run to completion hidden behind the still-closing
  // sheet, so by the time it's gone the screen just looks like it already
  // "hard cut" to the new state. `holdReveal` freezes what
  // SummaryCard/TransactionList are shown (via `displayTransactions` below)
  // to a snapshot taken when the sheet opens, only letting the real
  // (already-updated) data through once the sheet has actually finished
  // closing — same stash-then-fire shape as pendingBudgetCrossedRef below,
  // timed off the same addModalClosed flip. Set from both openAdd and
  // openEdit so the two land on the home screen with identical timing;
  // delete has no sheet, so TransactionItem holds it until the swipe row
  // has closed instead.
  const frozenTransactionsRef = useRef(null);
  const [holdReveal, setHoldReveal] = useState(false);
  // The transaction that reveal just brought in — TransactionList uses this
  // to play a one-off entrance (fade + push the rows below it down) on
  // exactly that row, not on every row a tab switch happens to re-key.
  const [justAddedId, setJustAddedId] = useState(null);

  useEffect(() => {
    if (!addModalClosed || !holdReveal) return;
    const beforeIds = new Set((frozenTransactionsRef.current || []).map(tx => tx.id));
    const added = transactions.find(tx => !beforeIds.has(tx.id));
    setHoldReveal(false);
    frozenTransactionsRef.current = null;
    if (!added) return;
    setJustAddedId(added.id);
    const t = setTimeout(() => setJustAddedId(null), 1000);
    return () => clearTimeout(t);
  }, [addModalClosed, holdReveal, transactions]);

  const displayTransactions = holdReveal && frozenTransactionsRef.current ? frozenTransactionsRef.current : transactions;

  // Mirrors web App.jsx's popup-trigger effect, rewritten against
  // AsyncStorage (async) instead of localStorage (sync). The daily insight
  // itself moved to a server-side push notification (check-daily-insights
  // cron) — this effect now only resolves the once-a-day recap decision.
  //
  // Deliberately does NOT require transactions.length > 0 — hasAnyRecapData
  // handles an empty array fine (nothing to show), and gating on it left
  // dailyPopupsResolved permanently false for a brand-new user, which in
  // turn blocked the budget-setup popup from ever opening until their first
  // transaction — colliding with AddModal closing right at that exact
  // moment (the "stuck after adding first transaction" bug).
  useEffect(() => {
    // budget.loading is included so this can't build/open the recap before
    // useBudget's own fetch has settled — budget.lastMonthAmount/hasBudget
    // start out null/false before that, which would silently omit the
    // budget slide (or show "no budget set") even when one genuinely
    // exists, and — like the transactions race this mirrors — this effect
    // only gets one real shot per day, so a premature pass here means the
    // recap shows with wrong/missing budget data for the rest of the day.
    if (!user || txLoading || budget.loading || !addModalClosed) return;
    let cancelled = false;

    (async () => {
      const todayStr = today();
      const { month, year: cy } = currentMonthYear();
      const prev = prevMonthYear(month, cy);
      // Deliberately 0-indexed (prev.month straight from prevMonthYear, no
      // +1) — matches the check-monthly-summary Edge Function's month_id
      // exactly, which is what lets the client's own "viewed" write and the
      // cron's "notified" write land on the same monthly_summary_status
      // row. Don't "fix" this to look like the budget-popup's own (1-indexed)
      // monthId below — they're unrelated keys for unrelated systems.
      const recapMonthId = `${prev.year}-${String(prev.month).padStart(2, '0')}`;

      // The CTA is available only on the day the recap was actually seen —
      // check whether that stamped date is today, not just whether there's
      // data to review. Deliberately doesn't build the full slide data here
      // (getMonthlyRecapSlides) — this whole effect re-runs on every
      // transaction add/edit/delete (transactions is a dependency below),
      // so doing that work here would rebuild last month's charts on every
      // single transaction change just to answer a yes/no question. The
      // slides are built lazily, only once the recap is actually about to
      // be shown — see openRecapFromCalendar and the auto-open block below.
      if (hasAnyRecapData(transactions, prev.month, prev.year)) {
        const availDate = await AsyncStorage.getItem(`okana_recap_available_date_${user.id}`);
        if (cancelled) return;
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(availDate === todayStr);
      } else if (!cancelled) {
        setRecapAvailable(false);
      }

      const shownKey = `okana_insight_shown_${user.id}`;
      const shownVal = await AsyncStorage.getItem(shownKey);
      if (shownVal === todayStr) { if (!cancelled) setDailyPopupsResolved(true); return; }
      await AsyncStorage.setItem(shownKey, todayStr);

      const recapShownKey = `okana_recap_shown_${user.id}`;
      let alreadyShown = (await AsyncStorage.getItem(recapShownKey)) === recapMonthId;
      if (!alreadyShown) {
        alreadyShown = await hasViewedRecapServerSide(user.id, recapMonthId);
        if (cancelled) return;
        if (alreadyShown) await AsyncStorage.setItem(recapShownKey, recapMonthId);
      }

      if (!alreadyShown && hasAnyRecapData(transactions, prev.month, prev.year)) {
        await AsyncStorage.setItem(recapShownKey, recapMonthId);
        if (cancelled) return;
        setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year, {
          amount: budget.lastMonthAmount,
          spent: budget.lastMonthSpent,
        }, budget.hasBudget));
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(true);
        // A short buffer before presenting this modal — this effect can fire
        // in the same tick as AddModal closing (adding a transaction changes
        // `transactions`, which is this effect's own dependency), and two
        // native RN <Modal>s open at once is a known broken state on Android
        // (see the note in SpendCalendarModal.js). Let whatever's closing
        // actually finish first.
        await new Promise(r => setTimeout(r, 320));
        if (cancelled) return;
        setRecapOpen(true);
        setDailyPopupsResolved(true);
        markRecapAvailableToday(user.id);
        markRecapViewedServerSide(user.id, recapMonthId);
        return;
      }

      if (!cancelled) setDailyPopupsResolved(true);
    })();

    return () => { cancelled = true; };
  }, [user, transactions, txLoading, budget.loading, addModalClosed, budget.lastMonthAmount, budget.lastMonthSpent, budget.hasBudget]);

  // Tapping the "{Month} Monthly Summary" push notification lands here with
  // ?openRecap=1 (see hooks/useNotificationRouting.js) — force-opens the
  // recap regardless of the once-a-month auto-show gating above, since
  // tapping the notification is explicit user intent, not the automatic
  // trigger. The param is cleared immediately so it can't re-fire on a
  // later re-render or when navigating back to this screen.
  useEffect(() => {
    // Same budget.loading wait as the auto-open effect above — without it,
    // tapping the notification right after a cold launch could build the
    // recap before budget data has loaded, silently dropping the budget
    // slide. Deliberately doesn't clear the param until this guard passes,
    // so it just re-fires once budget catches up rather than losing intent.
    if (params.openRecap !== '1' || !user || txLoading || budget.loading) return;
    router.setParams({ openRecap: undefined });

    const { month, year: cy } = currentMonthYear();
    const prev = prevMonthYear(month, cy);
    if (!hasAnyRecapData(transactions, prev.month, prev.year)) return;

    const recapMonthId = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
    setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year, {
      amount: budget.lastMonthAmount,
      spent: budget.lastMonthSpent,
    }, budget.hasBudget));
    setRecapMonthName(MONTH_NAMES[prev.month]);
    setRecapAvailable(true);
    setRecapOpen(true);
    markRecapAvailableToday(user.id);
    markRecapViewedServerSide(user.id, recapMonthId);
  }, [params.openRecap, user, txLoading, budget.loading, transactions, budget.lastMonthAmount, budget.lastMonthSpent, budget.hasBudget, router]);

  // Budget setup popup: due on the first app-open of a month with no budget
  // set yet. Kept as its OWN effect rather than folded into the once-a-day
  // chain above — that chain only gets one real pass per day (subsequent
  // re-runs short-circuit on the `shownKey` check), but `budget.loading`
  // comes from a separate async fetch in useBudget that doesn't reliably
  // resolve before that single daily pass runs, which would silently skip
  // this check on some days. This effect just re-evaluates whenever the
  // budget fetch settles, independent of that gate.
  useEffect(() => {
    if (!user || budget.loading || budget.hasBudget) return;
    let cancelled = false;

    (async () => {
      const { month, year: cy } = currentMonthYear();
      const monthId = `${cy}-${String(month + 1).padStart(2, '0')}`;
      const shownMonth = await AsyncStorage.getItem(`okana_budget_setup_shown_${user.id}`);
      if (!cancelled && shownMonth !== monthId) setBudgetSetupPending(true);
    })();

    return () => { cancelled = true; };
  }, [user, budget.loading, budget.hasBudget]);

  // Only actually opens once today's recap decision has resolved (and isn't
  // currently showing) — never ahead of or instead of it. Same
  // simultaneous-Modal concern as above — staggered behind a short delay.
  useEffect(() => {
    if (!(budgetSetupPending && dailyPopupsResolved && !recapOpen && addModalClosed)) return;
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setBudgetSetupOpen(true); }, 320);
    return () => { cancelled = true; clearTimeout(t); };
  }, [budgetSetupPending, dailyPopupsResolved, recapOpen, addModalClosed]);

  const closeRecap = useCallback(() => {
    setRecapOpen(false);
  }, []);

  // MonthlyRecapModal isn't a native <Modal> (it's a plain overlay View),
  // so unlike the calendar-to-budget handoff below, there's no "two native
  // Modals open at once" risk here — both state flips can happen together.
  const openBudgetSetupFromRecap = useCallback(() => {
    setRecapOpen(false);
    setBudgetSetupOpen(true);
  }, []);

  // Opening a second native Modal before SpendCalendarModal's own close
  // animation has actually finished is broken on Android (see the note in
  // SpendCalendarModal.js) — rather than guess a delay long enough to cover
  // it, stash what should open next and let SpendCalendarModal's onClosed
  // (fired only once it's truly gone) trigger it.
  const pendingAfterCalendarClose = useRef(null); // 'recap' | 'budget' | null

  // Holds whatever this render's transactions/budget values are, purely so
  // openRecapFromCalendar below can build the actual slide data on demand
  // (when the user taps the CTA) without needing transactions/budget in its
  // own dependency array — see the comment on the availability effect above
  // for why that matters.
  const recapInputsRef = useRef(null);
  recapInputsRef.current = { transactions, lastMonthAmount: budget.lastMonthAmount, lastMonthSpent: budget.lastMonthSpent, hasBudget: budget.hasBudget };

  const openRecapFromCalendar = useCallback(() => {
    const { month, year: cy } = currentMonthYear();
    const prev = prevMonthYear(month, cy);
    const { transactions: txs, lastMonthAmount, lastMonthSpent, hasBudget } = recapInputsRef.current;
    setRecapSlides(getMonthlyRecapSlides(txs, prev.month, prev.year, { amount: lastMonthAmount, spent: lastMonthSpent }, hasBudget));
    setRecapMonthName(MONTH_NAMES[prev.month]);
    pendingAfterCalendarClose.current = 'recap';
    setCalendarOpen(false);
  }, []);

  const handleCalendarClosed = useCallback(() => {
    const pending = pendingAfterCalendarClose.current;
    pendingAfterCalendarClose.current = null;
    if (pending === 'recap') setRecapOpen(true);
    else if (pending === 'budget') setBudgetSetupOpen(true);
  }, []);

  // Memoized — SpendCalendarModal stays mounted and memo()-wrapped even
  // while closed, so a fresh object reference here on every unrelated
  // Dashboard re-render (switching chart tabs, adding a transaction, etc.)
  // would defeat that memo every time.
  const recapForCalendar = useMemo(() => (
    recapAvailable
      ? { available: true, monthName: recapMonthName, onOpen: openRecapFromCalendar }
      : null
  ), [recapAvailable, recapMonthName, openRecapFromCalendar]);

  const closeBudgetSetup = useCallback(async () => {
    setBudgetSetupOpen(false);
    setBudgetSetupPending(false);
    if (!user) return;
    const { month, year: cy } = currentMonthYear();
    const monthId = `${cy}-${String(month + 1).padStart(2, '0')}`;
    await AsyncStorage.setItem(`okana_budget_setup_shown_${user.id}`, monthId);
  }, [user]);

  // Same deferred-open reasoning as openRecapFromCalendar above.
  const openBudgetSetupFromCalendar = useCallback(() => {
    pendingAfterCalendarClose.current = 'budget';
    setCalendarOpen(false);
  }, []);

  const budgetForCalendar = useMemo(() => ({
    loading: budget.loading,
    hasBudget: budget.hasBudget,
    amount: budget.amount,
    spent: budget.spentThisMonth,
    percent: budget.percent,
    onSetup: openBudgetSetupFromCalendar,
  }), [budget.loading, budget.hasBudget, budget.amount, budget.spentThisMonth, budget.percent, openBudgetSetupFromCalendar]);

  // Switching tabs itself is instant — every bar in the chart fully
  // remounts (a fresh, genuinely-new instance, not a reused one) whenever
  // its period changes, which is what actually fixed the old "wrong candle
  // flashes" bug (a reused bar briefly showing the *previous* period's
  // height at the new bar's position), not a delay here. An earlier version
  // of this also throttled how fast a new switch could be accepted, as a
  // second line of defense — that made rapid tapping feel unresponsive for
  // no remaining benefit once the real fix (the remount) and the other bug
  // (BarChart's height rounding) were in, so it's gone.
  const handleTimeRangeChange = useCallback((next) => {
    setTimeRange(next);
    setSelectedDay(null);
    if (next === 'year') {
      setYear(currYear);
      // null = whole year selected (no specific month candle tapped yet) —
      // shows the year's total/transactions until a bar is clicked.
      setSelectedMonth(null);
    }
  }, [currYear]);

  const handleChartTabChange = useCallback((next) => {
    setChartTab(next);
  }, []);

  const openAdd = useCallback(() => {
    if (trialInfo.status === 'expired' || trialInfo.status === 'not_started') { setProRequired(true); return; }
    setAddModalClosed(false);
    setEditData(null);
    setModalOpen(true);
    frozenTransactionsRef.current = transactions;
    setHoldReveal(true);
  }, [trialInfo.status, transactions]);

  const closeProRequired = useCallback(() => setProRequired(false), []);
  const subscribeFromProRequired = useCallback(() => {
    setProRequired(false);
    router.push('/(app)/subscription');
  }, [router]);

  const closeBudgetCrossed = useCallback(() => setBudgetCrossedOpen(false), []);

  // Set by addTransactionWithBudgetCheck below, consumed by the effect
  // right after it — not opened directly there because AddModal is still
  // mid-close at that point (its own native <Modal> is still up), and two
  // native Modals mounted at once is broken on Android (same constraint
  // documented on SpendCalendarModal/pendingAfterCalendarClose above).
  // Stashing the amount and waiting for addModalClosed to flip true mirrors
  // that same stash-then-fire pattern.
  const pendingBudgetCrossedRef = useRef(null);

  // Wraps addTransaction so it can compare this month's spend right before
  // and right after this one add — that's what "crossed" means (a genuine
  // under-to-over transition), rather than just "currently over", which
  // would also fire on every later add once already past the budget.
  // Expense-only (income never affects spend) and only when a budget is
  // actually set for the month.
  const addTransactionWithBudgetCheck = useCallback(async (data) => {
    const affectsBudget = data.type === 'expense' && budget.hasBudget && budget.amount > 0;
    const prevSpent = budget.spentThisMonth;
    const result = await addTransaction(data);
    if (result?.success !== false && affectsBudget) {
      const newSpent = prevSpent + parseFloat(data.amount);
      if (prevSpent <= budget.amount && newSpent > budget.amount) {
        pendingBudgetCrossedRef.current = newSpent - budget.amount;
      }
    }
    return result;
  }, [addTransaction, budget.hasBudget, budget.amount, budget.spentThisMonth]);

  useEffect(() => {
    if (!addModalClosed || pendingBudgetCrossedRef.current == null) return;
    setBudgetCrossedOverAmount(pendingBudgetCrossedRef.current);
    pendingBudgetCrossedRef.current = null;
    setBudgetCrossedOpen(true);
  }, [addModalClosed]);

  const openEdit = useCallback((tx) => {
    setAddModalClosed(false);
    setEditData(tx);
    setModalOpen(true);
    frozenTransactionsRef.current = transactions;
    setHoldReveal(true);
  }, [transactions]);

  // First-run product tour for the three Home-screen habits: adding a
  // transaction, switching chart tabs, and swiping a row to edit/delete.
  // The first two need no data and can run right after signup; the third
  // needs a real transaction to point at, so it just sits deferred (seen
  // stays false, step never becomes reachable) until one exists — no
  // forcing a brand-new, data-less account through a step with nothing to
  // show. (The calendar's color legend, tap-a-date, and budget section get
  // their own separate tour, triggered from SpendCalendarModal.js instead,
  // for the same "only show it once it's real" reason.)
  const fabRef = useRef(null);
  // The FAB had zero press feedback at all (a plain Pressable) — the most
  // frequently-tapped button on the whole screen deserved better than
  // nothing. A scale-down on press-in, spring back on release, same shape
  // as NumericKeypad's own per-key feedback.
  const fabScale = useSharedValue(1);
  const fabAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));
  const handleFabPressIn = useCallback(() => { fabScale.value = withTiming(0.92, { duration: 90 }); }, [fabScale]);
  const handleFabPressOut = useCallback(() => { fabScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.6)) }); }, [fabScale]);
  const tabToggleRef = useRef(null);
  const addTxTour = useTourStep(user?.id, 'add_transaction');
  const tabsTour = useTourStep(user?.id, 'income_expense_tabs');
  // No swipe step anymore: editing is reached by tapping a row, which needs
  // no teaching, and the swipe is now only a shortcut to delete rather than
  // the sole route to either action.
  const [homeTourActive, setHomeTourActive] = useState(null); // 'fab' | 'tabs' | null

  useEffect(() => {
    if (!user || homeTourActive) return;
    // Waits for the daily popup chain to settle, and none of the other
    // native-Modal popups on this screen to be open — same "never stack
    // two native Modals" constraint documented throughout this file.
    if (!dailyPopupsResolved || recapOpen || budgetSetupOpen || proRequired || budgetCrossedOpen || modalOpen) return;
    // A beat of breathing room before a hint appears — same idea as the
    // Calendar tour's own delay, so it never fires the instant the screen
    // lands, before the user has even had a chance to look around on their
    // own.
    const t = setTimeout(() => {
      if (!addTxTour.seen) { setHomeTourActive('fab'); return; }
      if (!tabsTour.seen) { setHomeTourActive('tabs'); }
    }, 1200);
    return () => clearTimeout(t);
  }, [user, homeTourActive, dailyPopupsResolved, recapOpen, budgetSetupOpen, proRequired, budgetCrossedOpen, modalOpen, addTxTour.seen, tabsTour.seen]);

  const advanceHomeTour = useCallback(() => {
    if (homeTourActive === 'fab') addTxTour.markSeen();
    else if (homeTourActive === 'tabs') tabsTour.markSeen();
    setHomeTourActive(null);
  }, [homeTourActive, addTxTour, tabsTour]);

  // Stable no-arg toggles for the modal props below — each was previously
  // an inline arrow function created fresh every render, which defeated
  // memo() on Header/AddModal/SpendCalendarModal:
  // any unrelated Dashboard state change (e.g. switching chart tabs) handed
  // them a "new" onClose/onMenuOpen prop and forced a full re-render of
  // each of those subtrees, AddModal being the heaviest of them.
  const openMenu = useCallback(() => router.push('/(app)/account'), [router]);

  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const closeAddModal = useCallback(() => setModalOpen(false), []);
  const handleAddModalClosed = useCallback(() => setAddModalClosed(true), []);

  return (
    <Animated.View
      className="flex-1"
      style={[{ backgroundColor: HOME_BG }, entranceStyle]}
      // Passively observes every touch-down anywhere on the screen (header
      // tabs, the month/year/All Time pills, empty space) to close an open
      // transaction swipe — always returns false so it never actually claims
      // the touch, leaving every button's own press handling untouched.
      onStartShouldSetResponderCapture={() => {
        transactionListRef.current?.closeOpenRow();
        return false;
      }}
    >
      {/* Only forces a dark status bar while this (experimentally light)
          screen is actually focused — expo-status-bar tracks mounted
          <StatusBar> elements as a stack, so this cedes back to the root
          layout's <StatusBar style="light" /> the instant a normal dark
          screen (Settings, Subscription, …) is pushed on top. */}
      {LIGHT_HOME && isFocused && <StatusBar style="dark" />}

      <Header
        onMenuOpen={openMenu}
        chartTab={chartTab}
        onChartTabChange={handleChartTabChange}
        onCalendarOpen={openCalendar}
        light={LIGHT_HOME}
        tabToggleRef={tabToggleRef}
      />

      <SummaryCard
        transactions={displayTransactions}
        chartTab={chartTab}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        selectedMonth={selectedMonth}
        year={year}
        onMonthChange={setSelectedMonth}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
        light={LIGHT_HOME}
      />

      <TransactionList
        ref={transactionListRef}
        transactions={displayTransactions}
        justAddedId={justAddedId}
        activeTab={chartTab}
        chartTab={chartTab}
        selectedMonth={timeRange === 'month' ? currMonth : selectedMonth}
        year={timeRange === '5y' ? currYear : year}
        timeRange={timeRange}
        selectedPeriod={selectedPeriod}
        selectedDay={selectedDay}
        onEdit={openEdit}
        onDelete={deleteTransaction}
        light={LIGHT_HOME}
      />

      <Animated.View
        ref={fabRef}
        // bottom-12 (48px) is measured from the raw screen edge — this screen
        // applies no safe-area inset — so it can't go much lower without
        // crowding the ~34pt home-indicator area.
        className="absolute bottom-12 self-center w-[68px] h-[68px] rounded-full items-center justify-center"
        style={[{ backgroundColor: PILL_ACTIVE_COLOR, left: '50%', marginLeft: -34, zIndex: 50, elevation: 50 }, fabAnimStyle]}
      >
        <Pressable
          onPress={openAdd}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
        >
          <PlusIcon size={30} color="#ffffff" />
        </Pressable>
      </Animated.View>

      <TourHint
        visible={homeTourActive === 'fab'}
        targetRef={fabRef}
        description="Tap here to add an expense or income."
        onNext={advanceHomeTour}
      />
      <TourHint
        visible={homeTourActive === 'tabs'}
        targetRef={tabToggleRef}
        description="Switch between Expense, Income, and Overview here."
        onNext={advanceHomeTour}
      />

      <AddModal
        open={modalOpen}
        onClose={closeAddModal}
        onClosed={handleAddModalClosed}
        onAdd={addTransactionWithBudgetCheck}
        onEdit={editTransaction}
        editData={editData}
        light={LIGHT_HOME}
      />

      <SpendCalendarModal
        open={calendarOpen}
        onClose={closeCalendar}
        onClosed={handleCalendarClosed}
        transactions={transactions}
        recap={recapForCalendar}
        budget={budgetForCalendar}
        light={LIGHT_HOME}
        userId={user?.id}
      />

      <MonthlyRecapModal
        open={recapOpen}
        slides={recapSlides}
        onClose={closeRecap}
        onOpenBudgetSetup={openBudgetSetupFromRecap}
      />

      <BudgetSetupModal
        open={budgetSetupOpen}
        onClose={closeBudgetSetup}
        onSubmit={budget.setBudget}
        lastMonthAmount={budget.lastMonthAmount}
        lastMonthSpent={budget.lastMonthSpent}
      />

      <AnimatedModal open={proRequired} onClose={closeProRequired} variant="center">
        <View
          className="w-full rounded-2xl p-6 items-center"
          style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <Text style={{ fontSize: 30 }} className="mb-3">🔒</Text>
          <Text className="text-white font-semibold text-base mb-2 text-center">Subscription Required</Text>
          <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>
            Your existing transactions are still here. Subscribe to Okana Plus to keep adding new ones.
          </Text>
          <View className="flex-row w-full" style={{ gap: 12 }}>
            <Pressable onPress={closeProRequired} className="flex-1 py-[11px] rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <Text className="text-white/60 text-base font-medium">Not now</Text>
            </Pressable>
            <Pressable onPress={subscribeFromProRequired} className="flex-1 py-[11px] rounded-xl items-center" style={{ backgroundColor: 'rgba(74,222,128,0.25)' }}>
              <Text className="text-base font-semibold" style={{ color: '#4ade80' }}>Subscribe Now</Text>
            </Pressable>
          </View>
        </View>
      </AnimatedModal>

      <AnimatedModal open={budgetCrossedOpen} onClose={closeBudgetCrossed} variant="center">
        <View
          className="w-full rounded-2xl p-6 items-center"
          style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <Text style={{ fontSize: 30 }} className="mb-3">⚠️</Text>
          <Text className="text-white font-semibold text-base mb-2 text-center">You've gone over budget</Text>
          <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>
            You're now {formatCurrency(budgetCrossedOverAmount)} over your {formatCurrency(budget.amount)} budget for {MONTH_NAMES[currMonth]}.
          </Text>
          <Pressable onPress={closeBudgetCrossed} className="w-full py-[11px] rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Text className="text-white text-base font-semibold">Got it</Text>
          </Pressable>
        </View>
      </AnimatedModal>

      {/* Gated on the same "nothing else is showing" set the tour hints use
          above — two native <Modal>s mounted at once is broken on Android
          (see AddModal/SpendCalendarModal's own notes on this), so this
          only actually opens once every other popup has cleared, not the
          instant the version check itself resolves. */}
      <UpdateSheet
        open={showUpdate && dailyPopupsResolved && !recapOpen && !budgetSetupOpen && !proRequired && !budgetCrossedOpen && !modalOpen}
        onDismiss={dismissUpdate}
      />
    </Animated.View>
  );
}
