import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Keyboard, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
// Aliased — `ReanimatedView.View` below is used both for the field rows'
// `layout` transition and (further down) the wheel picker's own animated
// column and rows; the named hooks/helpers (used only by the wheel, and by
// GoalSheet's own keyboard-avoidance for the debt Tenure/EMIs rows) are
// imported alongside it rather than off this default import.
import ReanimatedView, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, useDerivedValue,
  useAnimatedRef, useAnimatedKeyboard, measure, runOnUI,
  withSpring, withTiming, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPressable, INPUT_TEXT_STYLE, CARD_RADIUS, SMOOTH } from './Glass';
import { InlineSheet, OPEN_MS } from './InlineSheet';
import AddModal from './AddModal';
import { formatCurrency } from '../utils/format';
import { hapticTick } from '../utils/haptics';
import { textColor } from '../utils/colors';
import { SPRING_QUICK, layoutTransition } from '../utils/motion';
import { KIND_COPY, DEBT_SUGGESTIONS, dim } from './savingsShared';

// SPRING_QUICK, not SPRING_SMOOTH — same choice AmountEntrySheet's own
// AMOUNT_POSITION_TRANSITION makes for the same reason (see its comment):
// this fires the instant a row is tapped, so it should read as a direct
// response to that tap, not a calmer passive list reflow. It also has to
// keep pace with the tapped row's own height change (below) — with
// SMOOTH's slower settle, the sibling animated a beat behind the row that
// triggered it, and since the row's own newly-mounted content isn't
// implicitly clipped to its still-growing frame, that lag read as the
// panel briefly overlapping the sibling instead of the sibling just moving
// out of the way in step with it.
const FIELD_LAYOUT_TRANSITION = layoutTransition(SPRING_QUICK);

// Not the shared `Card`/`cardFill` from savingsShared.js — that fill
// (#151515) was tuned to sit on the main app's pure-black background, and
// reads as almost the same colour as THIS sheet's own background
// (InlineSheet's `#161616`), so the field cards below all but disappeared
// into it. A relative tint off the sheet's own background — not another
// absolute hex value that happens to clash — is what actually guarantees
// visible contrast regardless of exactly which dark/light background this
// sheet ends up on.
// memo'd, like the row components below — GoalSheet re-renders on every
// single pixel of an amount drag (the ruler's value lives in its state), and
// without this every OTHER field's card would re-render right along with it
// for no reason, which is exactly the kind of unnecessary work that was
// making the drag itself feel like it was hanging.
const FieldCard = memo(function FieldCard({ light, children }) {
  return (
    <View style={{ backgroundColor: light ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.07)', borderRadius: CARD_RADIUS, ...SMOOTH, overflow: 'hidden' }}>
      {children}
    </View>
  );
});

// Ideas for a goal's name, offered under the name field and on the empty
// state. Tapping one just fills the name in; it can still be edited.
export const GOAL_SUGGESTIONS = ['Emergency fund', 'Vacation', 'Bike', 'Home', 'New phone', 'Wedding'];

// Ideas for where a goal's money sits / a loan's "From" field — who it's
// owed to. Not exhaustive lists or enums — both fields are free text, these
// are just a fast path for the common cases (see the "Other" option every
// OptionsRow ends with).
const LOCATION_SUGGESTIONS = ['Bank', 'Liquid Fund', 'Chit Fund', 'Cash'];
const DEBT_FROM_SUGGESTIONS = ['Bank', 'Credit Card', 'Friend', 'Family', 'NBFC'];

// Add/Withdraw modes handed to AddModal (see MoneySheet below) — the same
// ReelSlider toggle design Home's own Expense/Income uses, since this really
// is that same sheet now, not a separately-built lookalike.
const MONEY_MODES = ['add', 'withdraw'];
const MONEY_LABELS = { add: 'Add', withdraw: 'Withdraw' };

// ---------------------------------------------------------------------------
// Apple Settings/Health-style rows: a plain label on the left, the current
// value (or a muted placeholder) on the right, a hairline between rows —
// modelled directly on the "Personalise Fitness and Health" and "Add Alarm"
// screens' own grouped lists, not a from-scratch invention. Two shapes,
// matching what that reference actually does for two different kinds of
// field, rather than forcing one interaction onto everything:
//   - OptionsRow: tapping the row expands a plain list of suggestions plus
//     "Other" below it, in the SAME card (Date of Birth/Height's own wheel
//     picker, just a list instead of a wheel — a wheel doesn't fit free text
//     or an open-ended amount). Picking "Other" is exactly TextRow below:
//     the row's own value turns into a live text field, right where it was.
//   - TextRow: tapping the row turns its own value into an editable field in
//     place (this is exactly how the video's "Label" field behaves) — no
//     list, because there's nothing sensible to suggest. An amount field
//     (AmountTextRow, below the wheel picker) is this same mechanism too,
//     just with a currency-formatted display — a third NAME for the same
//     shape, not a third interaction. There used to be an actual third
//     shape here, a drag ruler for currency fields (SliderRow); see
//     AmountTextRow's own comment for why that's gone.
// ---------------------------------------------------------------------------

const ROW_V_PAD = 14;
const ROW_H_PAD = 16;

function RowHeader({ label, light, onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: ROW_V_PAD, paddingHorizontal: ROW_H_PAD }}
    >
      <Text style={{ fontSize: 16, color: textColor(light).primary }}>{label}</Text>
      {children}
    </Pressable>
  );
}

function RowValueText({ value, placeholder, light }) {
  return (
    <Text numberOfLines={1} style={{ fontSize: 16, maxWidth: 190, color: value ? textColor(light).secondary : textColor(light).tertiary }}>
      {value || placeholder}
    </Text>
  );
}

// A free-text row whose own value becomes a live TextInput the moment it's
// tapped — same mechanism OptionsRow's "Other" falls into (see below), so a
// custom name/location and a genuinely free-text field like EMIs-paid share
// one implementation rather than two.
// memo'd — see FieldCard's own comment on why: unrelated fields shouldn't
// re-render just because the amount ruler's drag updates GoalSheet's state.
const TextRow = memo(function TextRow({ label, value, onChangeText, placeholder, light, keyboardType = 'default', autoCapitalize = 'sentences', maxLength, autoFocus = false, onFocusRow, onBlurRow }) {
  const [editing, setEditing] = useState(autoFocus);
  const inputRef = useRef(null);
  const startEditing = () => {
    onFocusRow?.();
    // Dismissing before focusing (rather than focusing straight over
    // whatever else was focused) matters specifically for this row's own
    // keyboardType: iOS only picks up a changed keyboard type — say,
    // jumping here from AmountTextRow's number-pad — on a fresh focus after
    // the old keyboard has actually torn down; focusing straight over it
    // left the previous keyboard showing until a second tap.
    Keyboard.dismiss();
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  return (
    <RowHeader label={label} light={light} onPress={editing ? undefined : startEditing}>
      {editing ? (
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={textColor(light).tertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          returnKeyType="done"
          onSubmitEditing={() => { Keyboard.dismiss(); setEditing(false); onBlurRow?.(); }}
          onBlur={() => { setEditing(false); onBlurRow?.(); }}
          style={[INPUT_TEXT_STYLE, { fontSize: 16, textAlign: 'right', color: textColor(light).primary, minWidth: 120, paddingVertical: 0 }]}
        />
      ) : (
        <RowValueText value={value} placeholder={placeholder} light={light} />
      )}
    </RowHeader>
  );
});

// ---------------------------------------------------------------------------
// An iOS-style wheel picker: the options scroll vertically under a fixed
// rounded "selection" pill in the middle, tilting away in a barrel curve and
// dimming with distance from the centre, and snap to the nearest one on
// release.
//
// Built on react-native-gesture-handler's Gesture.Pan + Reanimated shared
// values rather than the old PanResponder + react-native `Animated` (or a
// ScrollView with snapToInterval) — the drag, the spring-snap, and every
// per-row style all run as UI-thread worklets now, so nothing here waits on
// a JS-thread round trip per frame the way the bridge-based Animated API
// (and PanResponder's own JS callbacks) did; that round trip is what read as
// lag. GestureDetector still claims the touch outright the same way
// PanResponder did (see the row list's own comment further down on why that
// still matters here).
// ---------------------------------------------------------------------------

const WHEEL_ITEM_H = 40;
// 3, not 5 — a peek row above and below the centre is enough to read as a
// wheel; a 5-row window left a couple of rows' worth of dead space above the
// first option (and below the last) whenever the wheel opened on either end
// of a short list, which is most of the time here.
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = (WHEEL_H - WHEEL_ITEM_H) / 2; // centres item 0 at offset 0
const WHEEL_OVERSCROLL = WHEEL_ITEM_H * 0.6;
// Distance (in item-heights) either side of centre the barrel tilt/scale/
// opacity ramps are solved over.
const WHEEL_TILT_RANGE = [-2 * WHEEL_ITEM_H, -WHEEL_ITEM_H, 0, WHEEL_ITEM_H, 2 * WHEEL_ITEM_H];

// One row of the wheel. Its own component (not a style built in the parent
// and handed down) because each needs its own `useAnimatedStyle` worklet
// reading the shared `offset` — hooks can't be called in a loop, so the loop
// has to be a list of components instead.
function WheelRow({ offset, index, label, primaryColor }) {
  const style = useAnimatedStyle(() => {
    const d = offset.value - index * WHEEL_ITEM_H;
    return {
      opacity: interpolate(d, WHEEL_TILT_RANGE, [0.2, 0.45, 1, 0.45, 0.2], Extrapolation.CLAMP),
      transform: [
        // perspective first — it has to precede rotateX in the transform
        // array for the 3D tilt to actually read as depth instead of a flat
        // vertical squash.
        { perspective: 500 },
        { rotateX: `${interpolate(d, WHEEL_TILT_RANGE, [-42, -21, 0, 21, 42], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(d, WHEEL_TILT_RANGE, [0.82, 0.92, 1, 0.92, 0.82], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <ReanimatedView.View style={[{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text numberOfLines={1} style={{ fontSize: 19, color: primaryColor }}>
        {label}
      </Text>
    </ReanimatedView.View>
  );
}

function WheelPicker({ items, value, onSelect, light }) {
  const itemCount = items.length;
  const limit = (itemCount - 1) * WHEEL_ITEM_H;
  const initialIndex = Math.max(0, items.indexOf(value));
  const offset = useSharedValue(initialIndex * WHEEL_ITEM_H);
  const grabOffset = useSharedValue(initialIndex * WHEEL_ITEM_H);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const commit = useCallback(index => onSelectRef.current(itemsRef.current[index], index), []);
  const tick = useCallback(() => hapticTick(), []);

  // Haptic as each option passes under the selection, exactly like the
  // system picker — driven off the shared value so it fires during the
  // snap animation too, not just while a finger is down.
  useAnimatedReaction(
    () => Math.round(offset.value / WHEEL_ITEM_H),
    (idx, prevIdx) => {
      if (prevIdx !== null && idx !== prevIdx) runOnJS(tick)();
    },
  );

  function snapTo(index) {
    'worklet';
    const clamped = Math.max(0, Math.min(itemCount - 1, index));
    offset.value = withSpring(clamped * WHEEL_ITEM_H, { damping: 22, stiffness: 220, mass: 0.7 }, finished => {
      if (finished) runOnJS(commit)(clamped);
    });
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      grabOffset.value = offset.value;
    })
    .onUpdate(e => {
      // A little overscroll past either end, so the ends feel elastic
      // rather than walled off; the snap pulls it back.
      const next = grabOffset.value - e.translationY;
      offset.value = Math.max(-WHEEL_OVERSCROLL, Math.min(limit + WHEEL_OVERSCROLL, next));
    })
    .onEnd(e => {
      const movedFar = Math.abs(e.translationY) > 5 || Math.abs(e.translationX) > 5;
      if (!movedFar) {
        // A tap, not a drag: select whichever row was actually tapped,
        // measured from the centre.
        const rows = Math.round((e.y - WHEEL_H / 2) / WHEEL_ITEM_H);
        snapTo(Math.round(offset.value / WHEEL_ITEM_H) + rows);
        return;
      }
      // Project the flick a little past where the finger left off, so a
      // fast swipe carries through more options than a slow one.
      const projected = offset.value - e.velocityY * 0.12;
      snapTo(Math.round(projected / WHEEL_ITEM_H));
    })
    .onFinalize((_e, success) => {
      if (!success) snapTo(Math.round(offset.value / WHEEL_ITEM_H));
    });

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -offset.value }],
  }));

  const primaryColor = textColor(light).primary;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: WHEEL_H, overflow: 'hidden' }}>
        {/* The stationary selection pill the options pass under. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: ROW_H_PAD - 4,
            right: ROW_H_PAD - 4,
            top: WHEEL_PAD,
            height: WHEEL_ITEM_H,
            borderRadius: WHEEL_ITEM_H / 2,
            backgroundColor: dim(light, 0.10),
          }}
        />
        <ReanimatedView.View style={[{ paddingTop: WHEEL_PAD }, columnStyle]}>
          {items.map((item, i) => (
            <WheelRow key={item} offset={offset} index={i} label={item} primaryColor={primaryColor} />
          ))}
        </ReanimatedView.View>
      </View>
    </GestureDetector>
  );
}

const OTHER_OPTION = 'Other';

// Tapping the row expands an iOS-style wheel of the suggestions (plus
// "Other") directly beneath it, inside the same card. Landing on "Other"
// hands off to the same in-place text edit TextRow uses, rather than a
// second, different kind of input. The row stays open after a pick, the way
// the system settings rows do — the header's own value updates live, and
// tapping the header again collapses it.
// memo'd — see FieldCard's own comment on why.
const OptionsRow = memo(function OptionsRow({ label, value, onChangeText, options, placeholder, light, open, onOpen, onClose, maxLength, autoCapitalize = 'words', onFocusRow }) {
  const [editingCustom, setEditingCustom] = useState(false);
  const inputRef = useRef(null);

  const wheelItems = useMemo(() => [...options, OTHER_OPTION], [options]);

  const headerPress = () => {
    if (editingCustom) return;
    if (open) onClose(); else onOpen();
  };

  const handleWheelSelect = useCallback((item) => {
    if (item === OTHER_OPTION) {
      onFocusRow?.();
      // Same dismiss-before-focus as TextRow/AmountTextRow — landing here
      // from a different-keyboardType field left the wrong keyboard on
      // screen without it.
      Keyboard.dismiss();
      setEditingCustom(true);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    onChangeText(item);
  }, [onChangeText, onFocusRow]);

  return (
    <View>
      <RowHeader label={label} light={light} onPress={editingCustom ? undefined : headerPress}>
        {editingCustom ? (
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={textColor(light).tertiary}
            autoCapitalize={autoCapitalize}
            maxLength={maxLength}
            returnKeyType="done"
            onSubmitEditing={() => { Keyboard.dismiss(); setEditingCustom(false); onClose(); }}
            onBlur={() => { setEditingCustom(false); onClose(); }}
            style={[INPUT_TEXT_STYLE, { fontSize: 16, textAlign: 'right', color: textColor(light).primary, minWidth: 120, paddingVertical: 0 }]}
          />
        ) : (
          <RowValueText value={value} placeholder={placeholder} light={light} />
        )}
      </RowHeader>
      {!!(open && !editingCustom) && (
        <View style={{ paddingBottom: 8 }}>
          <WheelPicker items={wheelItems} value={value} onSelect={handleWheelSelect} light={light} />
        </View>
      )}
    </View>
  );
});

// Tapping the row turns its own value straight into the system number pad
// — no drag ruler in between any more (AmountRuler, removed entirely: an
// open-ended currency figure dialled in by dragging never reliably landed
// users on the number they actually meant, which is what "Enter exact
// amount" existed to work around in the first place — typing was always
// the real way in). This is TextRow's exact mechanism, just with a
// currency-formatted display instead of the raw string: collapsed, the
// row shows `formatCurrency(value)`; tapped, it's a plain digits-only
// TextInput on the system's own number-pad keyboard.
// memo'd — see FieldCard's own comment on why.
const AmountTextRow = memo(function AmountTextRow({ label, value, onChangeValue, placeholder, light, onFocusRow, onBlurRow }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const display = value > 0 ? formatCurrency(value) : '';

  const startEditing = () => {
    onFocusRow?.();
    // Same dismiss-before-focus as TextRow — see its own comment. Matters
    // here too since this is the field most often jumped to/from a
    // different keyboardType (a plain text row).
    Keyboard.dismiss();
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <RowHeader label={label} light={light} onPress={editing ? undefined : startEditing}>
      {editing ? (
        <TextInput
          ref={inputRef}
          value={value ? String(value) : ''}
          onChangeText={t => onChangeValue(parseInt(t.replace(/[^0-9]/g, '') || '0', 10))}
          placeholder={placeholder}
          placeholderTextColor={textColor(light).tertiary}
          keyboardType="number-pad"
          // 9 digits — up to ₹99,99,99,999 — matches BudgetPlan's own
          // amount field (ItemRow), the app's one other bare currency
          // TextInput; the old ruler's manual-entry fallback had no cap
          // at all, which was never a deliberate choice, just leftover
          // from typing being an afterthought instead of the main path.
          maxLength={9}
          returnKeyType="done"
          onSubmitEditing={() => { Keyboard.dismiss(); setEditing(false); onBlurRow?.(); }}
          onBlur={() => { setEditing(false); onBlurRow?.(); }}
          style={[INPUT_TEXT_STYLE, { fontSize: 16, textAlign: 'right', color: textColor(light).primary, minWidth: 100, paddingVertical: 0 }]}
        />
      ) : (
        <RowValueText value={display} placeholder={placeholder} light={light} />
      )}
    </RowHeader>
  );
});

// heightRatio, by field count: a flat 0.72 for every case (used until now)
// sized the sheet for debt's five rows even when editing a savings goal
// shows only three — the space that row count didn't use just sat blank
// between the last card and the Save button, because InlineSheet's own
// content area is `flex: 1` and stretches to fill whatever height the
// ratio hands it regardless of how tall the actual rows are. Three flat
// values instead of a formula, named for the row count each one is sized
// for — debt is always 5 (name, amount, location, tenure, EMIs paid,
// regardless of new vs edit), a new saving goal is 4 (adds "already
// saved"), editing one is 3. These are a best estimate, not a measurement
// (nothing here renders this to check it against an actual device) — nudge
// them if a state still shows a gap or, worse, clips a row.
//
// Tuned up from 0.62/0.56/0.5, which read as too tight on a device — the
// rows ended up crowding the Save button. These sit between that and the
// old flat 0.72, keeping each state proportional to its own row count.
const DEBT_HEIGHT_RATIO = 0.68;
const SAVINGS_NEW_HEIGHT_RATIO = 0.62;
const SAVINGS_EDIT_HEIGHT_RATIO = 0.56;

// New goal / edit goal — one page, one card, every field a plain row —
// modelled directly on the Health/Clock reference (see the row primitives
// above): label left, value right, tap to expand or edit in place. Replaces
// both the earlier two-step wizard (reverted — a multi-step goal-creation
// flow has been tried and rejected here before) and the flat boxed-field
// single page that came after it.
export function GoalSheet({ open, onClose, onClosed, goal, initialName = '', onSubmit, light = false, kind = 'savings' }) {
  const isEdit = !!goal;
  const copy = KIND_COPY[kind];
  const nameOptions = kind === 'debt' ? DEBT_SUGGESTIONS : GOAL_SUGGESTIONS;
  const whereOptions = kind === 'debt' ? DEBT_FROM_SUGGESTIONS : LOCATION_SUGGESTIONS;
  // See DEBT_HEIGHT_RATIO's own comment — matches how many rows render
  // below, not `openField`.
  const sheetHeightRatio = kind === 'debt' ? DEBT_HEIGHT_RATIO : (isEdit ? SAVINGS_EDIT_HEIGHT_RATIO : SAVINGS_NEW_HEIGHT_RATIO);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [location, setLocation] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [emisPaidBefore, setEmisPaidBefore] = useState('');
  const [startingAmount, setStartingAmount] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only one row's panel open at a time — same behaviour the reference
  // shows (opening Height's wheel closes Date of Birth's), not each row
  // managing its own independent expand state.
  const [openField, setOpenField] = useState(null);
  const openRow = (key) => setOpenField(key);
  const closeRow = () => setOpenField(null);

  // A text field taking focus (typing a custom name/location, or the
  // always-keyboard tenure/EMIs/exact-amount fields) closes whatever row's
  // picker panel is open — the same "only one thing expanded at a time"
  // rule `openRow` enforces between rows, extended to a row's own panel
  // vs. its text field.
  const focusField = useCallback((key) => {
    closeRow();
  }, []);

  // Debt's Tenure/EMIs rows sit at the very bottom of the field list, right
  // above the number-pad keyboard's own landing spot — on a short screen (or
  // once EMIs' row pushes even lower) the keyboard covers them outright, so
  // typing into either one is typing blind. Rather than moving the whole
  // sheet (InlineSheet's own comment explains why that was tried and
  // reverted: a tall sheet got shoved off the top of the screen for no
  // reason), this measures ONLY the field actually being typed into and
  // lifts the sheet by exactly its own overlap with the keyboard — nothing
  // moves until a covered field is genuinely covered, and other callers of
  // InlineSheet are untouched (`extraLift` is opt-in).
  const windowHeight = useWindowDimensions().height;
  const keyboard = useAnimatedKeyboard();
  const tenureRef = useAnimatedRef();
  const emisRef = useAnimatedRef();
  // 0 = neither field focused, 1 = Tenure, 2 = EMIs.
  const liftKind = useSharedValue(0);
  // The focused row's own on-screen position, captured once as it gains
  // focus (see captureRowBase below) — a fixed baseline, not re-measured
  // every frame, so the lift itself doesn't feed back into the measurement
  // it's based on as the sheet moves.
  const liftRowBaseY = useSharedValue(0);
  const liftRowBaseH = useSharedValue(0);

  const captureRowBase = useCallback((ref) => {
    runOnUI(() => {
      'worklet';
      const m = measure(ref);
      if (m) {
        liftRowBaseY.value = m.pageY;
        liftRowBaseH.value = m.height;
      }
    })();
  }, [liftRowBaseY, liftRowBaseH]);

  const focusTenure = useCallback(() => {
    focusField('tenure');
    liftKind.value = 1;
    captureRowBase(tenureRef);
  }, [focusField, liftKind, captureRowBase, tenureRef]);
  const blurTenure = useCallback(() => {
    if (liftKind.value === 1) liftKind.value = 0;
  }, [liftKind]);
  const focusEmis = useCallback(() => {
    focusField('emis');
    liftKind.value = 2;
    captureRowBase(emisRef);
  }, [focusField, liftKind, captureRowBase, emisRef]);
  const blurEmis = useCallback(() => {
    if (liftKind.value === 2) liftKind.value = 0;
  }, [liftKind]);

  // How far the sheet needs to rise for the focused row's own bottom edge
  // to clear the keyboard's top edge, plus a small margin — 0 the instant
  // nothing's focused (or the row was already clear of the keyboard), so
  // this is a no-op for every field except the two that actually need it.
  const extraLift = useDerivedValue(() => {
    if (liftKind.value === 0 || keyboard.height.value === 0) return withTiming(0, { duration: 180 });
    const rowBottom = liftRowBaseY.value + liftRowBaseH.value;
    const keyboardTop = windowHeight - keyboard.height.value;
    const overlap = Math.max(0, rowBottom - keyboardTop + 16);
    return withTiming(overlap, { duration: 180 });
  });

  // Same reasoning as AmountEntrySheet's own `positionReady` — held off for
  // exactly InlineSheet's open animation before any field row is allowed to
  // play its own `layout` transition, so resetting the fields' state right as
  // the sheet opens (below) doesn't layer a reflow slide on top of the
  // sheet's own opening slide.
  const [rowsReady, setRowsReady] = useState(false);
  useEffect(() => {
    if (!open) { setRowsReady(false); return; }
    const t = setTimeout(() => setRowsReady(true), OPEN_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setName(goal ? goal.name : initialName);
    setAmount(goal ? goal.target : 0);
    setLocation(goal ? goal.location : '');
    setTenureMonths(goal?.tenureMonths ? String(goal.tenureMonths) : '');
    setEmisPaidBefore(goal?.emisPaidBefore ? String(goal.emisPaidBefore) : '');
    setStartingAmount(0);
    setOpenField(null);
    setError('');
    setSubmitting(false);
  }, [open, goal, initialName]);

  const canSubmit = name.trim().length > 0 && amount > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    const tenure = kind === 'debt' && parseInt(tenureMonths, 10) > 0 ? parseInt(tenureMonths, 10) : null;
    const paidBefore = kind === 'debt' && parseInt(emisPaidBefore, 10) > 0 ? parseInt(emisPaidBefore, 10) : 0;
    const starting = !isEdit && kind === 'savings' && startingAmount > 0 ? startingAmount : 0;
    const result = await onSubmit({ name: name.trim(), target: amount, location, kind, tenureMonths: tenure, emisPaidBefore: paidBefore, startingAmount: starting });
    if (result?.success === false) {
      setSubmitting(false);
      if (!result.offline) setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }, [canSubmit, submitting, onSubmit, isEdit, kind, name, amount, location, tenureMonths, emisPaidBefore, startingAmount, onClose]);

  const insets = useSafeAreaInsets();
  const footer = (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 10 }}>
      {!!error && <Text className="text-red-400 text-sm text-center mb-2">{error}</Text>}
      <GlassPressable
        variant="active"
        radius={14}
        disabled={!canSubmit || submitting}
        onPress={handleSubmit}
        style={{ paddingVertical: 16, alignItems: 'center', opacity: canSubmit ? 1 : 0.5 }}
      >
        <Text className="text-black text-base font-semibold">{isEdit ? 'Save' : copy.submitLabel}</Text>
      </GlassPressable>
    </View>
  );

  return (
    // `dismissible` is gated on "is any field expanded right now":
    // InlineSheet's swipe-to-dismiss is an ancestor gesture wrapping
    // everything, and BOTH expanded controls now drag — the ruler
    // horizontally, the option wheel vertically. The wheel in particular is a
    // direct head-on conflict with a downward dismiss swipe, so the competing
    // gesture is removed outright rather than trusting threshold tuning to
    // arbitrate it (which failed repeatedly for the ruler).
    //
    // `heightRatio` is NOT gated on `openField` — it used to jump higher the
    // moment any field opened, so there was room for that field's panel with
    // the outer scroll disabled (below). But InlineSheet is a bottom sheet
    // (`bottom: 0`, height grows upward), so growing it pushes its TOP up by
    // however much it grew — and every row lives at a fixed offset from
    // that top, so the whole card (the row just tapped included) slid up
    // the screen right as it was tapped, away from the finger that opened
    // it. Fixed per `sheetHeightRatio` above instead — sized to how many
    // rows this kind/isEdit combination actually renders, not to whichever
    // field happens to be open — so opening or closing a field never
    // resizes the sheet at all: only the tapped row's own height changes
    // (see FIELD_LAYOUT_TRANSITION below), reflowing the rows under it
    // rather than moving the sheet itself. A field whose panel doesn't fit
    // in what's left just pushes the rows below it past the sheet's own
    // bottom edge — the row list has no scrolling at all any more (below),
    // so that content is simply not reachable until the field is closed
    // again, on purpose: the alternative is the sheet growing to guarantee
    // it always fits, which is exactly the resize this comment just tore
    // out.
    <InlineSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      light={light}
      heightRatio={sheetHeightRatio}
      dismissible={!submitting && !openField}
      footer={footer}
      extraLift={extraLift}
    >
      <Text className="text-center font-semibold" style={{ fontSize: 17, color: textColor(light).primary, marginBottom: 12 }}>
        {isEdit ? copy.sheetTitleEdit : copy.sheetTitleNew}
      </Text>

      {/* A plain View, not a ScrollView — this row list never scrolls, full
          stop, not even while nothing is expanded. It used to be a
          ScrollView with scrolling switched off only while a field was
          open: dragging inside an open field's own dropdown (OptionsRow's
          wheel) or ruler could still get partly claimed by this scroller
          underneath it (react-native-gesture-handler arbitrates the two
          gestures, and it didn't always resolve the way either control
          wanted — see the wheel/ruler's own PanResponder comments on losing
          that fight before), which felt like the card stack "jumping"
          under a selection gesture. Removing the ScrollView outright is
          what actually guarantees that can never happen again: there is no
          scroll gesture left in this tree to contend for a touch, on any
          field, at any time — not something tuned to usually not trigger.

          The sheet's own height is fixed (heightRatio, sized on
          InlineSheet above) and never grows for an expanded field, so a
          field whose panel doesn't fit in what's left — or, collapsed,
          whichever row happens to be last if a kind's fields don't all fit
          — just runs past this View's own bottom edge and is invisible
          until that field closes again. On purpose: see heightRatio's own
          comment for why growing the sheet to guarantee a fit isn't the
          answer here either.

          Each field is its own Card, not rows sharing one — a separate
          rounded card per field with a gap between them, matching the
          reference screenshot's own Filters sheet (Location/Price/Dates/
          Time each their own card) rather than one grouped list with
          internal hairlines. */}
      {/* Pressable, not View — a tap that lands on empty space between/
          around the cards (rather than on a row, which claims the touch for
          itself first) dismisses whichever field's keyboard is up. Without
          this, a number-pad field only closed via its own "Done" key or by
          focusing a different field; tapping the sheet's own blank space
          did nothing. */}
      <Pressable style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 12 }} onPress={Keyboard.dismiss}>
        <View style={{ gap: 12 }}>
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <OptionsRow
              label={copy.namePlaceholder}
              value={name}
              onChangeText={setName}
              options={nameOptions}
              placeholder="Not set"
              light={light}
              maxLength={60}
              autoCapitalize="sentences"
              open={openField === 'name'}
              onOpen={() => openRow('name')}
              onClose={closeRow}
              onFocusRow={() => focusField('name')}
            />
          </FieldCard>
          </ReanimatedView.View>
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <AmountTextRow
              label={kind === 'debt' ? 'Amount borrowed' : 'Target amount'}
              value={amount}
              onChangeValue={setAmount}
              placeholder="Set amount"
              light={light}
              onFocusRow={() => focusField('amount')}
            />
          </FieldCard>
          </ReanimatedView.View>
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <OptionsRow
              label={kind === 'debt' ? 'Borrowed from' : "Where it's kept"}
              value={location}
              onChangeText={setLocation}
              options={whereOptions}
              placeholder="Not set"
              light={light}
              maxLength={40}
              open={openField === 'location'}
              onOpen={() => openRow('location')}
              onClose={closeRow}
              onFocusRow={() => focusField('location')}
            />
          </FieldCard>
          </ReanimatedView.View>
          {kind === 'debt' ? (
            <>
              <ReanimatedView.View ref={tenureRef} layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
              <FieldCard light={light}>
                <TextRow
                  label="Tenure (months)"
                  value={tenureMonths}
                  onChangeText={t => setTenureMonths(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="Not set"
                  keyboardType="number-pad"
                  light={light}
                  onFocusRow={focusTenure}
                  onBlurRow={blurTenure}
                />
              </FieldCard>
              </ReanimatedView.View>
              <ReanimatedView.View ref={emisRef} layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
              <FieldCard light={light}>
                <TextRow
                  label="EMIs already paid"
                  value={emisPaidBefore}
                  onChangeText={t => setEmisPaidBefore(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="Not set"
                  keyboardType="number-pad"
                  light={light}
                  onFocusRow={focusEmis}
                  onBlurRow={blurEmis}
                />
              </FieldCard>
              </ReanimatedView.View>
            </>
          ) : !isEdit && (
            // Only for a brand-new goal — an existing one already has real
            // entries of its own, so re-asking "how much have you already
            // saved" no longer means anything.
            <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
            <FieldCard light={light}>
              <AmountTextRow
                label="Already saved"
                value={startingAmount}
                onChangeValue={setStartingAmount}
                placeholder="Not set"
                light={light}
                onFocusRow={() => focusField('starting')}
              />
            </FieldCard>
            </ReanimatedView.View>
          )}
        </View>
      </Pressable>
    </InlineSheet>
  );
}

// Add money to / withdraw from a goal, or edit an existing entry — now a
// thin wrapper around the same AddModal Home uses for its own transactions
// (see AddModal's own comment on the props that make this a real second
// caller), rather than a separately-built lookalike sheet. Debt only ever
// logs a payment — no Withdraw side to a loan — so its own modes list has
// just the one entry, which also skips AddModal's toggle entirely.
const DEBT_MONEY_MODES = ['add'];

export function MoneySheet({ open, onClose, onClosed, goalName, entry, initialType = 'add', maxWithdraw = 0, onSubmit, light = false, kind = 'savings' }) {
  const isEdit = !!entry;

  // AddModal's own {type, amount, date, description} shape, mapped to and
  // from this sheet's {type, amount, date, note} — a savings/debt entry has
  // a "note", not a "description", everywhere else it's used.
  const editData = entry ? { type: entry.type, amount: entry.amount, date: entry.date, description: entry.note } : null;
  const handleAdd = useCallback(({ type, amount, date, description }) => (
    onSubmit({ type, amount, date, note: description })
  ), [onSubmit]);
  const handleEdit = useCallback((_id, { type, amount, date, description }) => (
    onSubmit({ type, amount, date, note: description })
  ), [onSubmit]);

  // A new withdrawal is checked here for a friendlier message; an edit is
  // checked by the hook, which knows what the entry's own change does.
  // Debt never offers Withdraw (see DEBT_MONEY_MODES above), so `type`
  // can't actually be 'withdraw' for a debt entry — this is a no-op there.
  const validateWithdraw = useCallback((type, value) => (
    !isEdit && type === 'withdraw' && value > maxWithdraw
      ? `Only ${formatCurrency(maxWithdraw)} is saved in ${goalName}.`
      : null
  ), [isEdit, maxWithdraw, goalName]);

  return (
    <AddModal
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      onAdd={handleAdd}
      onEdit={handleEdit}
      editData={editData}
      modes={kind === 'debt' ? DEBT_MONEY_MODES : MONEY_MODES}
      labels={MONEY_LABELS}
      // Just wide enough to fit "Withdraw" in full without the reel's own
      // overflow:hidden clipping it (66 clipped, 80 read as too roomy — see
      // ReelSlider's own comment on what this spacing does).
      sliderSlot={74}
      initialMode={initialType}
      subtitle={goalName}
      fieldPlaceholder="Note (optional)"
      fieldRequired={false}
      extraValidate={validateWithdraw}
      light={light}
    />
  );
}
