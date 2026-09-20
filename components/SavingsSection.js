import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GlassPressable, CARD_RADIUS, SMOOTH } from './Glass';
import MonthSlider from './MonthSlider';
import Celebration from './Celebration';
import ErrorBoundary from './ErrorBoundary';
import { InlineConfirm } from './InlineConfirm';
import { GOAL_SUGGESTIONS, GoalSheet, MoneySheet } from './SavingsSheets';
import GoalCard from './GoalCard';
import { SwipeDeleteAction, useSwipeDelete, useSwipeGroup } from './SwipeDeleteAction';
import { Card, ProgressBar, ROUNDED_FONT, POSITIVE, cardFill, dim, money } from './savingsShared';
import { CheckIcon, ChevronRight, EditIcon, PlusIcon } from './icons';
import { currentMonthYear, dateBoxParts } from '../utils/format';
import { hapticAdded } from '../utils/haptics';
import { MONTH_NAMES } from '../utils/monthlyRecap';

// List and detail swap by crossfade — the same fade the home screen uses for a
// tab switch, and cheap because it's opacity only.
const SWAP_MS = 220;

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
// reports having closed (see flushGoalDelete): longer than its close animation.
const GOAL_DELETE_BACKSTOP_MS = 700;

// A line on how the goal got there: how many deposits, over how long, since
// when. Empty when there are no deposits to speak of.
function journeyNote(entries) {
  const deposits = entries.filter(e => e.type === 'add').length;
  if (deposits === 0) return '';
  const first = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
  const days = Math.max(1, Math.floor((Date.now() - new Date(`${first}T00:00:00`).getTime()) / 86400000));
  const span = days < 60 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(days / 30.44)} months`;
  return `${deposits} deposit${deposits === 1 ? '' : 's'} over ${span} · since ${MONTH_NAMES[Number(first.slice(5, 7)) - 1].slice(0, 3)} ${first.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Sheet state. Owned by the calendar page (not this section) because the
// sheets have to cover the whole page, header included — see InlineSheet — so
// they're rendered at that page's root by SavingsSheetsHost, while the list and
// detail views below only need the openers.
// ---------------------------------------------------------------------------
export function useSavingsUI() {
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
    setSheetData({ kind: 'goal', goalId: null, initialName });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
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
  const openEntry = useCallback((goalId, entryId) => {
    setSheetData({ kind: 'money', goalId, entryId, type: 'add' });
    setSheetClosed(false);
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
    sheetOpen, sheetData, sheetClosed, markSheetClosed, openNewGoal, openEditGoal, openMoney, openEntry, closeSheet,
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

  // A goal is deleted once the dialog has closed, not while it is still on
  // screen, so the card leaving the list is something you see. `flushGoalDelete`
  // runs from the dialog's own "closed" and from a timer behind it, in case that
  // never comes; whichever is first does it, once.
  const goalToDelete = useRef(null);
  const flushGoalDelete = useCallback(() => {
    const id = goalToDelete.current;
    goalToDelete.current = null;
    if (id) savings.deleteGoal(id);
  }, [savings]);

  const handleConfirm = useCallback(async () => {
    if (confirmBusy || !confirmData) return;
    if (confirmData.kind === 'goal') {
      goalToDelete.current = confirmData.goalId;
      closeConfirm();
      setTimeout(flushGoalDelete, GOAL_DELETE_BACKSTOP_MS);
      return;
    }
    setConfirmBusy(true);
    setConfirmError('');
    const result = await savings.deleteEntry(confirmData.entryId);
    setConfirmBusy(false);
    if (result?.success === false) {
      // Refused (e.g. later withdrawals depend on it) — stay open and say why.
      // Offline is different: the app's offline banner says so, so no message here.
      if (!result.offline) setConfirmError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    closeConfirm();
  }, [confirmBusy, confirmData, savings, closeConfirm, flushGoalDelete]);

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
      />
      <MoneySheet
        open={sheetOpen && sheetData?.kind === 'money'}
        onClose={closeSheet}
        onClosed={ui.markSheetClosed}
        goalName={goal?.name || ''}
        entry={entry}
        initialType={sheetData?.type || 'add'}
        maxWithdraw={goal?.saved || 0}
        onSubmit={submitMoney}
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
        onClosed={flushGoalDelete}
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
  const indexOf = (e) => Number(e.date.slice(0, 4)) * 12 + Number(e.date.slice(5, 7)) - 1;
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

// Memoised, with stable handlers, so a page-level change (the celebration coming
// and going, a sheet holding) doesn't repaint every row. Swiping it left reveals
// a delete button, which asks `onDelete` (the caller confirms). It paints the
// card's own fill, or the button underneath would show through as it slides.
const HistoryRow = memo(function HistoryRow({ entry, onPress, onDelete, registerSwipeable, onSwipeOpen, onRowPress, light }) {
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
                {entry.note || (isAdd ? 'Added' : 'Withdrew')}
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
function GoalDetail({ goal, savings, ui, light }) {
  const insets = useSafeAreaInsets();
  // Held back while the celebration is up, so the "goal reached" prompt comes
  // in once it has been dismissed rather than under it.
  const [celebrating, setCelebrating] = useState(false);
  const showReached = goal.reached && !goal.completedAt && !celebrating;
  const chart = useMemo(() => monthlyNets(goal.entries), [goal.entries]);

  // Celebrates the moment the goal reaches its target while this page is open.
  // A goal that was already reached when its page opened does not (nor one whose
  // page has just taken over from another goal's — this component is reused), so
  // what's compared is the same goal's `reached` from one render to the next.
  // Worked out during render, not in an effect, so the prompt above never gets a
  // frame on screen before the celebration covers it.
  const [seen, setSeen] = useState({ id: goal.id, reached: goal.reached });
  if (seen.id !== goal.id || seen.reached !== goal.reached) {
    setSeen({ id: goal.id, reached: goal.reached });
    if (seen.id === goal.id && goal.reached && !seen.reached) setCelebrating(true);
  }
  useEffect(() => {
    if (celebrating) hapticAdded();
  }, [celebrating]);
  const endCelebration = useCallback(() => setCelebrating(false), []);
  const swipes = useSwipeGroup();
  const { openEntry, openDeleteEntry } = ui;
  const editEntry = useCallback((entryId) => openEntry(goal.id, entryId), [openEntry, goal.id]);
  const deleteEntry = useCallback((entryId) => openDeleteEntry(goal.id, entryId), [openDeleteEntry, goal.id]);

  return (
    <View style={{ flex: 1 }}>
    {/* Everything down to the History label stays put; only the history below
        it scrolls, the way the transaction list does on the home screen. */}
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      {/* The name with the pencil right beside it, centred together. The name
          shrinks (and truncates) before it can push the pencil out of the row.
          Deleting a goal is done by swiping its card on the list. */}
      <View className="flex-row items-center justify-center" style={{ minWidth: 0 }}>
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

      {/* The big figure, a plain progress bar (the same one the goal cards
          use) and its two captions. */}
      <View style={{ marginTop: 16, paddingBottom: 10, marginBottom: 16 }}>
        <View className="flex-row items-baseline justify-center mb-4" style={{ gap: 6 }}>
          <Text style={{ color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.80)', fontSize: 32, fontWeight: '600', letterSpacing: -0.5 }}>{money(goal.saved)}</Text>
          <Text style={{ color: dim(light, 0.5), fontSize: 15 }}>saved</Text>
        </View>
        <ProgressBar percent={goal.percent} height={8} light={light} />
        <View className="flex-row items-center justify-between mt-2.5">
          <Text className="text-xs" style={{ color: dim(light, 0.4) }}>{goal.percent}%</Text>
          <Text className="text-xs" style={{ color: dim(light, 0.4) }}>{money(goal.target)} target</Text>
        </View>
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
        <Animated.View entering={FadeIn.duration(SWAP_MS)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, borderRadius: CARD_RADIUS, ...SMOOTH, backgroundColor: 'rgba(74,222,128,0.10)' }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <CheckIcon size={16} color={POSITIVE} />
            <Text className="text-base" style={{ color: POSITIVE }}>Goal reached</Text>
          </View>
          <Pressable onPress={() => savings.setGoalCompleted(goal.id, true)} hitSlop={8} accessibilityRole="button">
            <Text className="text-base font-medium" style={{ color: light ? '#111111' : '#ffffff' }}>Mark as done</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Net per month from the first entry on, as a row that slides under a
          fixed centre — the month in the middle is the one read out. Not shown
          until there is something to plot. `key` reopens it on the current
          month when another goal's page takes over this one. */}
      {goal.entries.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text className="text-[11px] font-medium uppercase tracking-widest px-1 mb-2" style={{ color: dim(light, 0.3) }}>Monthly savings</Text>
          <Card light={light}>
            {/* The average sits at the top left; the slider below has no side
                padding, so its bars slide right out to the card's edge. */}
            <View style={{ paddingVertical: 16 }}>
              <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
                <Text style={{ color: light ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.90)', fontSize: 26, fontWeight: '600', letterSpacing: -0.5 }}>
                  {chart.average < 0 ? '−' : ''}{money(Math.abs(chart.average))}
                </Text>
                <Text className="text-sm" style={{ color: dim(light, 0.5), marginTop: 2 }}>average per month</Text>
              </View>
              <MonthSlider key={goal.id} months={chart.months} initialIndex={chart.initialIndex} light={light} />
            </View>
          </Card>
        </View>
      )}

      <Text className="text-[11px] font-medium uppercase tracking-widest px-1 mb-2" style={{ color: dim(light, 0.3), marginTop: 28 }}>
        History
      </Text>
    </View>

    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      onScrollBeginDrag={swipes.closeOpen}
      // Clears the round button that floats over the bottom of the page.
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}
    >
      {goal.entries.length === 0 ? (
        <Text className="text-base px-1" style={{ color: dim(light, 0.3) }}>Nothing added yet.</Text>
      ) : (
        <Card light={light}>
          {goal.entries.map((e, i) => (
            <View key={e.id}>
              <HistoryRow
                entry={e}
                onPress={editEntry}
                onDelete={deleteEntry}
                registerSwipeable={swipes.registerSwipeable}
                onSwipeOpen={swipes.onSwipeOpen}
                onRowPress={swipes.onRowPress}
                light={light}
              />
              {i < goal.entries.length - 1 && <Divider inset={16} light={light} />}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
    <AddFab onPress={() => ui.openMoney(goal.id, 'add')} label="Add or withdraw money" />
    {/* Decoration: if it fails it goes away, and the "goal reached" prompt it was
        holding back comes straight in. */}
    {celebrating && (
      <ErrorBoundary onError={endCelebration}>
        <Celebration title="Congrats, you made it" subtitle={`${goal.name} · ${money(goal.target)}`} note={journeyNote(goal.entries)} onDone={endCelebration} />
      </ErrorBoundary>
    )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function SavingsSection({ savings, ui, active, light = false, detailGoalId, onOpenGoal, onCloseGoal }) {
  const insets = useSafeAreaInsets();
  // What is shown is held while a sheet is open, and let go once it has
  // finished closing. The held copy is whatever was current the last time no
  // sheet was up, i.e. the moment before the one now open appeared.
  const liveView = { goals: savings.goals, completedGoals: savings.completedGoals, allGoals: savings.allGoals, totalSaved: savings.totalSaved };
  const heldViewRef = useRef(liveView);
  if (ui.sheetClosed) heldViewRef.current = liveView;
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

              {goals.map(g => <GoalCard key={g.id} goal={g} {...cardProps} />)}

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
                      {completedGoals.map(g => <GoalCard key={g.id} goal={g} {...cardProps} done />)}
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
