import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import { useBudget } from '../../hooks/useBudget';
import { useSubscription } from '../../hooks/useSubscription';
import { getSubscriptionDisplayStatus, getPendingSubscriptionPopup, PRICE_PER_YEAR } from '../../utils/trial';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import TransactionList from '../../components/TransactionList';
import AddModal from '../../components/AddModal';
import Drawer from '../../components/Drawer';
import SpendCalendarModal from '../../components/SpendCalendarModal';
import DailyInsightModal from '../../components/DailyInsightModal';
import MonthlyRecapModal from '../../components/MonthlyRecapModal';
import BudgetSetupModal from '../../components/BudgetSetupModal';
import { AnimatedModal } from '../../components/AnimatedModal';
import { PlusIcon } from '../../components/icons';
import { currentMonthYear, monthLabel, today } from '../../utils/format';
import { getDailyInsight } from '../../utils/insights';
import { getMonthlyRecapSlides, hasAnyRecapData, prevMonthYear, MONTH_NAMES } from '../../utils/monthlyRecap';

// Mirrors the web app's App.jsx — same copy, same keys.
const SINGLE_CTA_POPUPS = {
  'trial-tomorrow': {
    emoji: '⏳',
    headline: 'Your Okana Plus trial ends tomorrow',
    message: `Your saved payment method will be charged ₹${PRICE_PER_YEAR} for the annual plan after your trial ends.`,
    cta: 'Continue with Okana Plus',
  },
  'success': {
    emoji: '🎉',
    headline: "You're now subscribed to Okana Plus",
    message: 'Your annual subscription has started successfully.',
    cta: 'Continue Tracking',
  },
};

const DOUBLE_CTA_POPUPS = {
  'trial-ended': {
    emoji: '⏳',
    headline: 'Your free trial ends today',
    message: 'Okana Plus features will no longer be available after today. Subscribe to keep unlimited access.',
  },
  'payment-failed': {
    emoji: '⚠️',
    headline: 'Payment failed',
    message: "We couldn't process your Okana Plus payment. Please update your payment method to continue accessing Plus features.",
  },
  'sub-ended': {
    emoji: '👋',
    headline: 'Your Okana Plus subscription has ended',
    message: "You're now using Okana Free and no longer have access to Plus-only features.",
  },
};

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { transactions, loading: txLoading, addTransaction, editTransaction, deleteTransaction, refresh: refreshTransactions } = useTransactions();
  const budget = useBudget(user, transactions);
  const { subscription, loading: subLoading } = useSubscription(user);
  const trialInfo = useMemo(() => getSubscriptionDisplayStatus(subscription, today()), [subscription]);

  // Erase Data / other changes made from Account (a separate stacked screen)
  // update Supabase directly without touching this screen's own useTransactions/
  // useBudget state — refetch both whenever Dashboard regains focus so
  // returning here reflects them instead of showing stale, pre-erase data.
  useFocusEffect(
    useCallback(() => { refreshTransactions(); budget.refresh(); }, [refreshTransactions, budget.refresh])
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { month: currMonth, year: currYear } = currentMonthYear();

  const [chartTab, setChartTab] = useState('expense');
  const [timeRange, setTimeRange] = useState('month');
  const [year, setYear] = useState(currYear);
  const [selectedMonth, setSelectedMonth] = useState(currMonth);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  const [dailyInsight, setDailyInsight] = useState(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapSlides, setRecapSlides] = useState([]);
  const [recapMonthLabel, setRecapMonthLabel] = useState('');
  const [recapMonthName, setRecapMonthName] = useState('');
  const [recapAvailable, setRecapAvailable] = useState(false);
  const [recapSeen, setRecapSeen] = useState(false);

  const [budgetSetupOpen, setBudgetSetupOpen] = useState(false);
  const [budgetSetupPending, setBudgetSetupPending] = useState(false);
  const [dailyPopupsResolved, setDailyPopupsResolved] = useState(false);

  const [proRequired, setProRequired] = useState(false);
  const [pendingSubPopup, setPendingSubPopup] = useState(null);
  const [activeSubPopup, setActiveSubPopup] = useState(null);

  // Tracks whether AddModal's own native <Modal> has actually finished
  // closing (not just whether `modalOpen` is false) — see addModalClosed
  // usage below for why this matters.
  const [addModalClosed, setAddModalClosed] = useState(true);

  // Mirrors web App.jsx's popup-trigger effect, rewritten against
  // AsyncStorage (async) instead of localStorage (sync). Recap takes
  // priority over the daily insight on the first open after a month
  // rollover; otherwise the daily insight shows once per day.
  //
  // Deliberately does NOT require transactions.length > 0 — hasAnyRecapData/
  // getDailyInsight both handle an empty array fine (nothing to show), and
  // gating on it left dailyPopupsResolved permanently false for a brand-new
  // user, which in turn blocked the budget-setup popup from ever opening
  // until their first transaction — colliding with AddModal closing right
  // at that exact moment (the "stuck after adding first transaction" bug).
  useEffect(() => {
    if (!user || txLoading || !addModalClosed) return;
    let cancelled = false;

    (async () => {
      const todayStr = today();
      const { month, year: cy } = currentMonthYear();
      const prev = prevMonthYear(month, cy);

      const availKey = `okana_recap_available_date_${user.id}`;
      const isAvailableToday = (await AsyncStorage.getItem(availKey)) === todayStr;

      if (isAvailableToday && hasAnyRecapData(transactions, prev.month, prev.year)) {
        const seenVal = await AsyncStorage.getItem(`okana_recap_seen_${user.id}_${todayStr}`);
        if (cancelled) return;
        setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year));
        setRecapMonthLabel(monthLabel(prev.month, prev.year));
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(true);
        setRecapSeen(seenVal === '1');
      } else if (!cancelled) {
        setRecapAvailable(false);
      }

      const shownKey = `okana_insight_shown_${user.id}`;
      const shownVal = await AsyncStorage.getItem(shownKey);
      if (shownVal === todayStr) { if (!cancelled) setDailyPopupsResolved(true); return; }
      await AsyncStorage.setItem(shownKey, todayStr);

      const recapShownKey = `okana_recap_shown_${user.id}`;
      const recapMonthId = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
      const alreadyShown = (await AsyncStorage.getItem(recapShownKey)) === recapMonthId;

      if (!alreadyShown && hasAnyRecapData(transactions, prev.month, prev.year)) {
        await AsyncStorage.setItem(recapShownKey, recapMonthId);
        await AsyncStorage.setItem(availKey, todayStr);
        if (cancelled) return;
        setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year));
        setRecapMonthLabel(monthLabel(prev.month, prev.year));
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(true);
        setRecapSeen(false);
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
        return;
      }

      const insight = getDailyInsight(transactions, todayStr);
      if (insight) {
        await new Promise(r => setTimeout(r, 320));
        if (cancelled) return;
        setDailyInsight(insight);
      }
      if (!cancelled) setDailyPopupsResolved(true);
    })();

    return () => { cancelled = true; };
  }, [user, transactions, txLoading, addModalClosed]);

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

  // Only actually opens once today's recap/insight decision has resolved
  // (and neither is currently showing) — never ahead of or instead of them.
  // Same simultaneous-Modal concern as above — staggered behind a short delay.
  useEffect(() => {
    if (!(budgetSetupPending && dailyPopupsResolved && !recapOpen && !dailyInsight && addModalClosed)) return;
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setBudgetSetupOpen(true); }, 320);
    return () => { cancelled = true; clearTimeout(t); };
  }, [budgetSetupPending, dailyPopupsResolved, recapOpen, dailyInsight, addModalClosed]);

  // Subscription lifecycle notices (trial ending tomorrow, payment failed,
  // subscription started/ended) — mirrors web App.jsx's equivalent effect.
  // Flags one as due independent of the daily-shown-key chain above, since
  // these are once-per-event notices (see getPendingSubscriptionPopup), not
  // once-per-day ones.
  useEffect(() => {
    if (!user || subLoading) return;
    let cancelled = false;
    (async () => {
      const pending = getPendingSubscriptionPopup(subscription, trialInfo, user.id);
      if (!pending) return;
      const seen = await AsyncStorage.getItem(pending.key);
      if (cancelled || seen === '1') return;
      setPendingSubPopup(pending);
    })();
    return () => { cancelled = true; };
  }, [user, subLoading, subscription, trialInfo.status, trialInfo.paymentFailed, trialInfo.daysLeft, trialInfo.cancelAtPeriodEnd, trialInfo.everBilled]);

  // Only actually shows once today's spending summary / recap / budget
  // prompt (if any) has resolved — spending data always comes first.
  // Staggered behind the same short delay for the same simultaneous-Modal
  // reason as the effects above.
  useEffect(() => {
    if (!pendingSubPopup) return;
    if (!dailyPopupsResolved || recapOpen || dailyInsight || budgetSetupOpen || !addModalClosed) return;
    let cancelled = false;
    (async () => {
      const seen = await AsyncStorage.getItem(pendingSubPopup.key);
      if (seen === '1') { if (!cancelled) setPendingSubPopup(null); return; }
      await AsyncStorage.setItem(pendingSubPopup.key, '1');
      await new Promise(r => setTimeout(r, 320));
      if (cancelled) return;
      setActiveSubPopup(pendingSubPopup.type);
      setPendingSubPopup(null);
    })();
    return () => { cancelled = true; };
  }, [pendingSubPopup, dailyPopupsResolved, recapOpen, dailyInsight, budgetSetupOpen, addModalClosed]);

  const closeRecap = useCallback(async () => {
    setRecapOpen(false);
    if (!user) return;
    const todayStr = today();
    await AsyncStorage.setItem(`okana_recap_seen_${user.id}_${todayStr}`, '1');
    setRecapSeen(true);
  }, [user]);

  // Opening a second native Modal before SpendCalendarModal's own close
  // animation has actually finished is broken on Android (see the note in
  // SpendCalendarModal.js) — rather than guess a delay long enough to cover
  // it, stash what should open next and let SpendCalendarModal's onClosed
  // (fired only once it's truly gone) trigger it.
  const pendingAfterCalendarClose = useRef(null); // 'recap' | 'budget' | null

  const openRecapFromCalendar = useCallback(() => {
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
      ? { available: true, seen: recapSeen, monthName: recapMonthName, onOpen: openRecapFromCalendar }
      : null
  ), [recapAvailable, recapSeen, recapMonthName, openRecapFromCalendar]);

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
    if (trialInfo.status === 'expired') { setProRequired(true); return; }
    setAddModalClosed(false);
    setEditData(null);
    setModalOpen(true);
  }, [trialInfo.status]);

  const closeProRequired = useCallback(() => setProRequired(false), []);
  const subscribeFromProRequired = useCallback(() => {
    setProRequired(false);
    router.push('/(app)/subscription');
  }, [router]);

  const closeActiveSubPopup = useCallback(() => setActiveSubPopup(null), []);
  const subscribeFromPopup = useCallback(() => {
    setActiveSubPopup(null);
    router.push('/(app)/subscription');
  }, [router]);

  const openEdit = useCallback((tx) => {
    setAddModalClosed(false);
    setEditData(tx);
    setModalOpen(true);
  }, []);

  // Stable no-arg toggles for the modal props below — each was previously
  // an inline arrow function created fresh every render, which defeated
  // memo() on Header/AddModal/SpendCalendarModal/Drawer/DailyInsightModal:
  // any unrelated Dashboard state change (e.g. switching chart tabs) handed
  // them a "new" onClose/onMenuOpen prop and forced a full re-render of
  // each of those subtrees, AddModal's ~10-BlurView tree being the worst
  // of it.
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const closeAddModal = useCallback(() => setModalOpen(false), []);
  const handleAddModalClosed = useCallback(() => setAddModalClosed(true), []);
  const closeDailyInsight = useCallback(() => setDailyInsight(null), []);

  return (
    <View className="flex-1 bg-bg">
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
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
      />

      <TransactionList
        transactions={transactions}
        activeTab={chartTab}
        chartTab={chartTab}
        selectedMonth={timeRange === 'month' ? currMonth : selectedMonth}
        year={timeRange === '5y' ? currYear : year}
        timeRange={timeRange}
        selectedYear={selectedYear}
        selectedDay={selectedDay}
        onEdit={openEdit}
      />

      <Pressable
        onPress={openAdd}
        className="absolute bottom-20 self-center w-20 h-20 rounded-full items-center justify-center"
        style={{ backgroundColor: '#4a4a4a', left: '50%', marginLeft: -40, zIndex: 50, elevation: 50 }}
      >
        <PlusIcon size={30} />
      </Pressable>

      <AddModal
        open={modalOpen}
        onClose={closeAddModal}
        onClosed={handleAddModalClosed}
        onAdd={addTransaction}
        onEdit={editTransaction}
        onDelete={deleteTransaction}
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

      <DailyInsightModal insight={dailyInsight} onClose={closeDailyInsight} />

      <Drawer open={drawerOpen} onClose={closeDrawer} />

      <MonthlyRecapModal
        open={recapOpen}
        slides={recapSlides}
        monthLabel={recapMonthLabel}
        onClose={closeRecap}
      />

      <BudgetSetupModal open={budgetSetupOpen} onClose={closeBudgetSetup} onSubmit={budget.setBudget} />

      <AnimatedModal open={proRequired} onClose={closeProRequired} variant="center">
        <View
          className="w-full rounded-2xl p-6 items-center"
          style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <Text style={{ fontSize: 30 }} className="mb-3">🔒</Text>
          <Text className="text-white font-semibold text-base mb-2 text-center">Pro subscription required</Text>
          <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>
            Your subscription has ended. You can still view everything — subscribe to Okana Plus to keep adding new transactions.
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

      <AnimatedModal open={!!(activeSubPopup && SINGLE_CTA_POPUPS[activeSubPopup])} onClose={closeActiveSubPopup} variant="center">
        {activeSubPopup && SINGLE_CTA_POPUPS[activeSubPopup] && (
          <View
            className="w-full rounded-2xl p-6 items-center"
            style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
          >
            <Text style={{ fontSize: 30 }} className="mb-3">{SINGLE_CTA_POPUPS[activeSubPopup].emoji}</Text>
            <Text className="text-white font-semibold text-base mb-2 text-center">{SINGLE_CTA_POPUPS[activeSubPopup].headline}</Text>
            <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>{SINGLE_CTA_POPUPS[activeSubPopup].message}</Text>
            <Pressable onPress={closeActiveSubPopup} className="w-full py-[13px] rounded-2xl items-center" style={{ backgroundColor: 'rgba(74,222,128,0.25)' }}>
              <Text className="text-base font-semibold" style={{ color: '#4ade80' }}>{SINGLE_CTA_POPUPS[activeSubPopup].cta}</Text>
            </Pressable>
          </View>
        )}
      </AnimatedModal>

      <AnimatedModal open={!!(activeSubPopup && DOUBLE_CTA_POPUPS[activeSubPopup])} onClose={closeActiveSubPopup} variant="center">
        {activeSubPopup && DOUBLE_CTA_POPUPS[activeSubPopup] && (
          <View
            className="w-full rounded-2xl p-6 items-center"
            style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
          >
            <Text style={{ fontSize: 30 }} className="mb-3">{DOUBLE_CTA_POPUPS[activeSubPopup].emoji}</Text>
            <Text className="text-white font-semibold text-base mb-2 text-center">{DOUBLE_CTA_POPUPS[activeSubPopup].headline}</Text>
            <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>{DOUBLE_CTA_POPUPS[activeSubPopup].message}</Text>
            <View className="flex-row w-full" style={{ gap: 12 }}>
              <Pressable onPress={closeActiveSubPopup} className="flex-1 py-[11px] rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <Text className="text-white/60 text-base font-medium">Not now</Text>
              </Pressable>
              <Pressable onPress={subscribeFromPopup} className="flex-1 py-[11px] rounded-xl items-center" style={{ backgroundColor: 'rgba(74,222,128,0.25)' }}>
                <Text className="text-base font-semibold" style={{ color: '#4ade80' }}>Subscribe Now</Text>
              </Pressable>
            </View>
          </View>
        )}
      </AnimatedModal>
    </View>
  );
}
