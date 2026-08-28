import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import Drawer from '../../components/Drawer';
import SpendCalendarModal from '../../components/SpendCalendarModal';
import MonthlyRecapModal from '../../components/MonthlyRecapModal';
import BudgetSetupModal from '../../components/BudgetSetupModal';
import { AnimatedModal } from '../../components/AnimatedModal';
import { PlusIcon } from '../../components/icons';
import { PILL_ACTIVE_COLOR } from '../../components/Glass';
import { currentMonthYear, today } from '../../utils/format';
import { getMonthlyRecapSlides, hasAnyRecapData, prevMonthYear, MONTH_NAMES } from '../../utils/monthlyRecap';

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

export default function Dashboard() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { transactions, loading: txLoading, addTransaction, editTransaction, deleteTransaction, refresh: refreshTransactions } = useTransactions();
  const budget = useBudget(user, transactions);
  const { subscription, loading: subLoading, refresh: refreshSubscription } = useSubscription(user);
  const trialInfo = useMemo(() => getSubscriptionDisplayStatus(subscription, today()), [subscription]);
  const transactionListRef = useRef(null);

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

  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Tracks whether AddModal's own native <Modal> has actually finished
  // closing (not just whether `modalOpen` is false) — see addModalClosed
  // usage below for why this matters.
  const [addModalClosed, setAddModalClosed] = useState(true);

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
    if (!user || txLoading || !addModalClosed) return;
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
      const alreadyShown = (await AsyncStorage.getItem(recapShownKey)) === recapMonthId;

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
  }, [user, transactions, txLoading, addModalClosed, budget.lastMonthAmount, budget.lastMonthSpent, budget.hasBudget]);

  // Tapping the "{Month} Monthly Summary" push notification lands here with
  // ?openRecap=1 (see hooks/useNotificationRouting.js) — force-opens the
  // recap regardless of the once-a-month auto-show gating above, since
  // tapping the notification is explicit user intent, not the automatic
  // trigger. The param is cleared immediately so it can't re-fire on a
  // later re-render or when navigating back to this screen.
  useEffect(() => {
    if (params.openRecap !== '1' || !user || txLoading) return;
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
  }, [params.openRecap, user, txLoading, transactions, budget.lastMonthAmount, budget.lastMonthSpent, budget.hasBudget, router]);

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

  // Memoized — SpendCalendarModal is always mounted (unlike Drawer, which
  // just returns null when closed) and memo()-wrapped, so a fresh object
  // reference here on every unrelated Dashboard re-render (switching chart
  // tabs, adding a transaction, etc.) would defeat that memo every time.
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

  const handleTimeRangeChange = useCallback((next) => {
    setTimeRange(next);
    setSelectedDay(null);
    if (next === 'year') {
      setYear(currYear);
      setSelectedMonth(currMonth);
    }
  }, [currYear, currMonth]);

  const openAdd = useCallback(() => {
    if (trialInfo.status === 'expired' || trialInfo.status === 'not_started') { setProRequired(true); return; }
    setAddModalClosed(false);
    setEditData(null);
    setModalOpen(true);
  }, [trialInfo.status]);

  const closeProRequired = useCallback(() => setProRequired(false), []);
  const subscribeFromProRequired = useCallback(() => {
    setProRequired(false);
    router.push('/(app)/subscription');
  }, [router]);

  const openEdit = useCallback((tx) => {
    setAddModalClosed(false);
    setEditData(tx);
    setModalOpen(true);
  }, []);

  // Stable no-arg toggles for the modal props below — each was previously
  // an inline arrow function created fresh every render, which defeated
  // memo() on Header/AddModal/SpendCalendarModal/Drawer:
  // any unrelated Dashboard state change (e.g. switching chart tabs) handed
  // them a "new" onClose/onMenuOpen prop and forced a full re-render of
  // each of those subtrees, AddModal being the heaviest of them.
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const closeAddModal = useCallback(() => setModalOpen(false), []);
  const handleAddModalClosed = useCallback(() => setAddModalClosed(true), []);

  return (
    <View
      className="flex-1 bg-bg"
      // Passively observes every touch-down anywhere on the screen (header
      // tabs, the month/year/All Time pills, empty space) to close an open
      // transaction swipe — always returns false so it never actually claims
      // the touch, leaving every button's own press handling untouched.
      onStartShouldSetResponderCapture={() => {
        transactionListRef.current?.closeOpenRow();
        return false;
      }}
    >
      <Header
        onMenuOpen={openDrawer}
        chartTab={chartTab}
        onChartTabChange={setChartTab}
        onCalendarOpen={openCalendar}
      />

      <SummaryCard
        transactions={transactions}
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
      />

      <TransactionList
        ref={transactionListRef}
        transactions={transactions}
        activeTab={chartTab}
        chartTab={chartTab}
        selectedMonth={timeRange === 'month' ? currMonth : selectedMonth}
        year={timeRange === '5y' ? currYear : year}
        timeRange={timeRange}
        selectedPeriod={selectedPeriod}
        selectedDay={selectedDay}
        onEdit={openEdit}
        onDelete={deleteTransaction}
      />

      <Pressable
        onPress={openAdd}
        className="absolute bottom-20 self-center w-[68px] h-[68px] rounded-full items-center justify-center"
        style={{ backgroundColor: PILL_ACTIVE_COLOR, left: '50%', marginLeft: -34, zIndex: 50, elevation: 50 }}
      >
        <PlusIcon size={30} color="#ffffff" />
      </Pressable>

      <AddModal
        open={modalOpen}
        onClose={closeAddModal}
        onClosed={handleAddModalClosed}
        onAdd={addTransaction}
        onEdit={editTransaction}
        editData={editData}
      />

      <SpendCalendarModal
        open={calendarOpen}
        onClose={closeCalendar}
        onClosed={handleCalendarClosed}
        transactions={transactions}
        recap={recapForCalendar}
        budget={budgetForCalendar}
      />

      <Drawer open={drawerOpen} onClose={closeDrawer} />

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
    </View>
  );
}
