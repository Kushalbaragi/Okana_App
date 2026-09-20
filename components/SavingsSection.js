import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import BarChart from './BarChart';
import BudgetStatusBar from './BudgetStatusBar';
import { InlineConfirm } from './InlineConfirm';
import { GOAL_SUGGESTIONS, GoalSheet, MoneySheet } from './SavingsSheets';
import { GoalCard } from './GoalCard';
import { Card, ROUNDED_FONT, POSITIVE, dim, money } from './savingsShared';
import { CheckIcon, ChevronRight, EditIcon, PlusIcon, TrashIcon } from './icons';
import { currentMonthYear, dateBoxParts } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';

// A softer red than the one used for errors — a resting delete icon shouldn't
// shout.
const DANGER_SOFT = 'rgba(248,113,113,0.65)';

// List and detail swap by crossfade — the same fade the home screen uses for a
// tab switch, and cheap because it's opacity only.
const SWAP_MS = 220;

// Padding and alignment are inline styles here, not classNames, on the
// GlassPressables below: className on an animated component depends on
// NativeWind's interop, which react-native-web doesn't apply, so an inline
// style is the one form that renders identically everywhere.
const HISTORY_PAD = { paddingHorizontal: 16, paddingVertical: 12 };
const CENTERED = { alignItems: 'center', justifyContent: 'center' };

// How many months the goal chart covers, ending with the current one.
const CHART_MONTHS = 6;

// ---------------------------------------------------------------------------
// Sheet state. Owned by the calendar page (not this section) because the
// sheets have to cover the whole page, header included — see InlineSheet — so
// they're rendered at that page's root by SavingsSheetsHost, while the list and
// detail views below only need the openers.
// ---------------------------------------------------------------------------
export function useSavingsUI() {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Kept separate from `sheetOpen` so the sheet's content stays put while it
  // animates closed instead of blanking mid-slide.
  const [sheetData, setSheetData] = useState(null);

  const openNewGoal = useCallback((initialName = '') => {
    setSheetData({ kind: 'goal', goalId: null, initialName });
    setSheetOpen(true);
  }, []);
  const openEditGoal = useCallback((goalId) => {
    setSheetData({ kind: 'goal', goalId, initialName: '' });
    setSheetOpen(true);
  }, []);
  const openMoney = useCallback((goalId, type) => {
    setSheetData({ kind: 'money', goalId, entryId: null, type });
    setSheetOpen(true);
  }, []);
  const openEntry = useCallback((goalId, entryId) => {
    setSheetData({ kind: 'money', goalId, entryId, type: 'add' });
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
    sheetOpen, sheetData, openNewGoal, openEditGoal, openMoney, openEntry, closeSheet,
    confirmOpen, confirmData, openDeleteGoal, openDeleteEntry, closeConfirm,
  };
}

export function SavingsSheetsHost({ savings, ui, light = false }) {
  const { sheetOpen, sheetData, closeSheet, confirmOpen, confirmData, closeConfirm } = ui;
  const goalId = sheetData?.goalId ?? null;
  const goal = goalId ? savings.allGoals.find(g => g.id === goalId) : null;
  const entry = sheetData?.entryId && goal ? goal.entries.find(e => e.id === sheetData.entryId) : null;

  const submitGoal = useCallback(({ name, target }) => (
    goalId ? savings.editGoal(goalId, { name, target }) : savings.addGoal({ name, target })
  ), [savings, goalId]);

  const submitMoney = useCallback(({ type, amount, note, date }) => (
    entry ? savings.updateEntry(entry.id, { type, amount, note, date }) : savings.addEntry(goalId, { type, amount, note, date })
  ), [savings, goalId, entry]);

  // What the confirmation is about, looked up from the data rather than
  // carried in state so it can't go stale.
  const confirmGoal = confirmData ? savings.allGoals.find(g => g.id === confirmData.goalId) : null;
  const confirmEntry = confirmData?.kind === 'entry' && confirmGoal ? confirmGoal.entries.find(e => e.id === confirmData.entryId) : null;
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  useEffect(() => {
    if (confirmOpen) { setConfirmBusy(false); setConfirmError(''); }
  }, [confirmOpen]);

  let confirmTitle = '';
  let confirmMessage = '';
  if (confirmData?.kind === 'goal' && confirmGoal) {
    const what = confirmGoal.saved > 0
      ? `${confirmGoal.name} and its ${money(confirmGoal.saved)} history`
      : confirmGoal.entries.length > 0 ? `${confirmGoal.name} and its history` : confirmGoal.name;
    confirmTitle = 'Delete goal?';
    confirmMessage = `${what} will be deleted. This can't be undone.`;
  } else if (confirmData?.kind === 'entry' && confirmEntry && confirmGoal) {
    confirmTitle = 'Delete entry?';
    confirmMessage = `This ${money(confirmEntry.amount)} ${confirmEntry.type === 'add' ? 'deposit' : 'withdrawal'} will be removed from ${confirmGoal.name}.`;
  }

  const handleConfirm = useCallback(async () => {
    if (confirmBusy || !confirmData) return;
    if (confirmData.kind === 'goal') {
      // The goal leaves the list at once (the write is optimistic), which is
      // what closes its page — nothing more to do here.
      savings.deleteGoal(confirmData.goalId);
      closeConfirm();
      return;
    }
    setConfirmBusy(true);
    setConfirmError('');
    const result = await savings.deleteEntry(confirmData.entryId);
    setConfirmBusy(false);
    if (result?.success === false) {
      // Refused (e.g. later withdrawals depend on it) — stay open and say why.
      setConfirmError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    closeConfirm();
    closeSheet();
  }, [confirmBusy, confirmData, savings, closeConfirm, closeSheet]);

  return (
    <>
      <GoalSheet
        open={sheetOpen && sheetData?.kind === 'goal'}
        onClose={closeSheet}
        goal={goal}
        initialName={sheetData?.initialName || ''}
        onSubmit={submitGoal}
        light={light}
      />
      <MoneySheet
        open={sheetOpen && sheetData?.kind === 'money'}
        onClose={closeSheet}
        goalName={goal?.name || ''}
        entry={entry}
        initialType={sheetData?.type || 'add'}
        maxWithdraw={goal?.saved || 0}
        onSubmit={submitMoney}
        onRequestDelete={() => ui.openDeleteEntry(goalId, entry?.id)}
        light={light}
      />
      {/* Last, so it sits above the sheets as well as the page. */}
      <InlineConfirm
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        error={confirmError}
        busy={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        light={light}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Net money moved in each of CHART_MONTHS months: adds minus withdrawals. The
// window starts at the month of the goal's first entry and runs forward, so a
// young goal shows its first months with the empty ones still to come. Once
// the goal is older than the window, it rolls forward so the current month is
// always the last bar rather than falling off the end. The chart draws each
// month's size as a positive bar and marks it red when withdrawals beat adds
// that month, green otherwise.
function monthlyNet(entries) {
  const { month, year } = currentMonthYear();
  const nowIndex = year * 12 + month;
  let start = nowIndex - (CHART_MONTHS - 1);
  if (entries.length > 0) {
    start = Math.min(...entries.map(e => Number(e.date.slice(0, 4)) * 12 + Number(e.date.slice(5, 7)) - 1));
    if (nowIndex > start + CHART_MONTHS - 1) start = nowIndex - (CHART_MONTHS - 1);
  }
  const months = [];
  for (let i = 0; i < CHART_MONTHS; i++) {
    const idx = start + i;
    const y = Math.floor(idx / 12);
    const m = idx % 12;
    months.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, label: MONTH_NAMES[m].slice(0, 3) });
  }
  const totals = new Map(months.map(m => [m.key, 0]));
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (totals.has(key)) totals.set(key, totals.get(key) + (e.type === 'add' ? e.amount : -e.amount));
  }
  const nets = months.map(m => totals.get(m.key));
  return {
    labels: months.map(m => m.label),
    values: nets.map(n => Math.abs(n)),
    negative: nets.map(n => n < 0),
  };
}

// The button at the bottom of the list: a labelled pill rather than a bare "+",
// since starting a goal is the one thing this page is for and the words say so.
// The app's primary-CTA treatment (light fill, dark text) — the same as Create,
// Add and Save — because it is this page's one main action.
function NewGoalButton({ onPress }) {
  const insets = useSafeAreaInsets();
  return (
    // The wrapper spans the width only to centre the pill without measuring
    // it; box-none lets touches beside the pill fall through to the list.
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, alignItems: 'center' }}>
      <GlassPressable
        variant="active"
        radius={9999}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="New goal"
        style={{ paddingHorizontal: 28, paddingVertical: 16, alignItems: 'center' }}
      >
        <Text className="text-base font-semibold text-black">New goal</Text>
      </GlassPressable>
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

function Divider({ inset = 16, light }) {
  return <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: inset, backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }} />;
}

function EmptyState({ onNew, light }) {
  return (
    <View className="items-center" style={{ paddingTop: 72, paddingHorizontal: 16 }}>
      <Text className="text-xl font-semibold text-center" style={{ color: light ? '#111111' : '#ffffff' }}>Start your first goal</Text>
      <Text className="text-base text-center" style={{ color: dim(light, 0.4), marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
        Track what you're setting aside for a bike, a home, or a rainy day.
      </Text>
      <GlassPressable variant="active" radius={9999} onPress={() => onNew('')} style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}>
        <Text className="text-black text-[15px] font-semibold">New goal</Text>
      </GlassPressable>
      <View className="flex-row flex-wrap justify-center" style={{ gap: 8, marginTop: 20 }}>
        {GOAL_SUGGESTIONS.map(name => (
          <GlassPressable key={name} variant="field" radius={9999} onPress={() => onNew(name)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: dim(light, 0.14) }}>
            <Text className="text-sm" style={{ color: dim(light, 0.7) }}>{name}</Text>
          </GlassPressable>
        ))}
      </View>
    </View>
  );
}

// Same little date chip as a transaction row.
function DateChip({ dateStr, light }) {
  const { day, month } = dateBoxParts(dateStr);
  return (
    <View className="items-center justify-center w-8 h-8 rounded shrink-0" style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
      <Text className="text-[11px] font-semibold leading-none" style={{ color: dim(light, 0.7) }}>{day}</Text>
      <Text className="text-[8px] font-medium leading-none mt-0.5 tracking-tight" style={{ color: dim(light, 0.3) }}>{month}</Text>
    </View>
  );
}

function HistoryRow({ entry, onPress, light }) {
  const isAdd = entry.type === 'add';
  return (
    <GlassPressable variant="field" pressScale={false} onPress={() => onPress(entry.id)} style={HISTORY_PAD} accessibilityRole="button">
      <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <View className="flex-row items-center flex-1" style={{ gap: 10 }}>
          <DateChip dateStr={entry.date} light={light} />
          <Text className="text-base" numberOfLines={1} style={{ flexShrink: 1, color: light ? '#111111' : '#ffffff' }}>
            {entry.note || (isAdd ? 'Added' : 'Withdrew')}
          </Text>
        </View>
        <Text className="text-base font-medium" style={{ color: isAdd ? POSITIVE : dim(light, 0.5) }}>
          {isAdd ? '+' : '−'}{money(entry.amount)}
        </Text>
      </View>
    </GlassPressable>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function GoalDetail({ goal, savings, ui, light }) {
  const insets = useSafeAreaInsets();
  const showReached = goal.reached && !goal.completedAt;
  const chart = useMemo(() => monthlyNet(goal.entries), [goal.entries]);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      // Clears the round button that floats over the bottom of the page.
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 120 }}
    >
      {/* The pencil sits right beside the name; the trash stays at the far
          right. The left spacer is as wide as the trash so the name and pencil
          together stay centred. The name shrinks (and truncates) before it can
          push the pencil out of the row. */}
      <View className="flex-row items-center justify-between">
        <View style={{ width: 32 }} />
        <View className="flex-row items-center justify-center" style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-base" numberOfLines={1} style={{ flexShrink: 1, color: dim(light, 0.5) }}>{goal.name}</Text>
          <Pressable
            onPress={() => ui.openEditGoal(goal.id)}
            className="w-8 h-8 items-center justify-center rounded-lg"
            accessibilityRole="button"
            accessibilityLabel="Edit goal"
          >
            <EditIcon color={dim(light, 0.4)} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => ui.openDeleteGoal(goal.id)}
          className="w-8 h-8 items-center justify-center rounded-lg"
          accessibilityRole="button"
          accessibilityLabel="Delete goal"
        >
          <TrashIcon size={16} color={DANGER_SOFT} />
        </Pressable>
      </View>

      {/* Exactly the Budget section's bar — the big figure, the segmented bar
          and its two captions — with goal wording. */}
      <View style={{ marginTop: 16 }}>
        <BudgetStatusBar
          loading={false}
          hasBudget
          percent={goal.percent}
          light={light}
          hideDivider
          summary={{ hero: money(goal.saved), suffix: 'saved', left: `${goal.percent}%`, right: `${money(goal.target)} target` }}
        />
      </View>

      {goal.completedAt ? (
        <View className="flex-row items-center justify-center" style={{ gap: 10, marginTop: 20 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <CheckIcon size={16} color={POSITIVE} />
            <Text className="text-base" style={{ color: POSITIVE }}>Completed</Text>
          </View>
          <Pressable onPress={() => savings.setGoalCompleted(goal.id, false)} hitSlop={8} accessibilityRole="button">
            <Text className="text-base" style={{ color: dim(light, 0.4) }}>Reopen</Text>
          </Pressable>
        </View>
      ) : showReached ? (
        <Animated.View entering={FadeIn.duration(SWAP_MS)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(74,222,128,0.10)' }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <CheckIcon size={16} color={POSITIVE} />
            <Text className="text-base" style={{ color: POSITIVE }}>Goal reached</Text>
          </View>
          <Pressable onPress={() => savings.setGoalCompleted(goal.id, true)} hitSlop={8} accessibilityRole="button">
            <Text className="text-base font-medium" style={{ color: light ? '#111111' : '#ffffff' }}>Mark as done</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Net per month over the last few months — green where more went in
          than came out, red where withdrawals won. A readout only, so no
          taps. Not shown until there is something to plot. */}
      {goal.entries.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <View style={{ paddingHorizontal: 4 }}>
            <BarChart
              values={chart.values}
              labels={chart.labels}
              negative={chart.negative}
              isIncome
              animKey={goal.id}
              light={light}
            />
          </View>
        </View>
      )}

      <Text className="text-[11px] font-medium uppercase tracking-widest px-1 mb-2" style={{ color: dim(light, 0.3), marginTop: 28 }}>History</Text>
      {goal.entries.length === 0 ? (
        <Text className="text-base px-1" style={{ color: dim(light, 0.3) }}>Nothing added yet.</Text>
      ) : (
        <Card light={light}>
          {goal.entries.map((e, i) => (
            <View key={e.id}>
              <HistoryRow entry={e} onPress={(id) => ui.openEntry(goal.id, id)} light={light} />
              {i < goal.entries.length - 1 && <Divider inset={16} light={light} />}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
    <AddFab onPress={() => ui.openMoney(goal.id, 'add')} label="Add or withdraw money" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function SavingsSection({ savings, ui, active, light = false, detailGoalId, onOpenGoal, onCloseGoal }) {
  const insets = useSafeAreaInsets();
  const { goals, completedGoals, allGoals, totalSaved } = savings;
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

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, listStyle]} pointerEvents={detailOpen ? 'none' : 'auto'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 130 }}
        >
          {isEmpty ? (
            <EmptyState onNew={ui.openNewGoal} light={light} />
          ) : (
            <>
              <View className="items-center" style={{ paddingBottom: 22 }}>
                <Text className="text-sm" style={{ color: dim(light, 0.4) }}>Total Savings</Text>
                <Text
                  style={{ fontSize: 44, lineHeight: 52, fontWeight: '600', letterSpacing: -1, color: light ? '#111111' : '#ffffff', fontFamily: ROUNDED_FONT }}
                >
                  {money(totalSaved)}
                </Text>
              </View>

              {goals.map(g => <GoalCard key={g.id} goal={g} onPress={onOpenGoal} light={light} />)}

              {completedGoals.length > 0 && (
                <>
                  <Pressable
                    onPress={() => setShowCompleted(v => !v)}
                    className="flex-row items-center justify-between px-1"
                    style={{ paddingVertical: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="Completed goals"
                  >
                    <Text className="text-sm" style={{ color: dim(light, 0.4) }}>Completed · {completedGoals.length}</Text>
                    <View style={{ transform: [{ rotate: showCompleted ? '90deg' : '0deg' }] }}>
                      <ChevronRight color={dim(light, 0.3)} />
                    </View>
                  </Pressable>
                  {showCompleted && (
                    <Animated.View entering={FadeIn.duration(SWAP_MS)}>
                      {completedGoals.map(g => <GoalCard key={g.id} goal={g} onPress={onOpenGoal} light={light} done />)}
                    </Animated.View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>

        {!isEmpty && <NewGoalButton onPress={() => ui.openNewGoal('')} />}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, detailStyle]} pointerEvents={detailOpen ? 'auto' : 'none'}>
        {detailGoal && <GoalDetail goal={detailGoal} savings={savings} ui={ui} light={light} />}
      </Animated.View>
    </View>
  );
}

export default memo(SavingsSection);
