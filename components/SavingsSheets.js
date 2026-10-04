import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Keyboard } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
// Aliased — `ReanimatedView.View` below is used both for the field rows'
// `layout` transition and (further down) the wheel picker's own animated
// column and rows; the named hooks/helpers (used only by the wheel) are
// imported alongside it rather than off this default import.
import ReanimatedView, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction,
  withSpring, runOnJS, FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, parseISO } from 'date-fns';
import { GlassPressable, INPUT_TEXT_STYLE, CARD_RADIUS, SMOOTH } from './Glass';
import { InlineSheet, OPEN_MS } from './InlineSheet';
import AddModal from './AddModal';
import AmountRuler, { monthsScale } from './AmountRuler';
import { formatCurrency, formatDateFull, today, toDateStr } from '../utils/format';
import { ChevronRight } from './icons';
import { hapticTick } from '../utils/haptics';
import { WHEEL_ITEM_H, WHEEL_H, WHEEL_PAD, WHEEL_OVERSCROLL, WheelRow, DateWheelPicker } from './wheel';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';
import { SPRING_QUICK, layoutTransition } from '../utils/motion';
import { KIND_COPY, dim, money } from './savingsShared';

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
//
// The flat colour this tint actually renders as, over InlineSheet's own
// background — needed by the months ruler below, whose edge-fade has to
// dissolve into a real flat colour (an SVG gradient stop, not a style) and
// so can't just reuse this View's own translucent `rgba` fill the way the
// card itself does. Computed by hand (base × (1 − alpha) + white/black ×
// alpha) and kept in sync with the overlay colours just below; a mismatch
// here is exactly what used to show up as a dark seam under the ruler,
// cutting the card in two instead of the fade actually blending into it.
const FIELD_CARD_SURFACE = { light: '#efefed', dark: '#262626' };
const FieldCard = memo(function FieldCard({ light, children }) {
  return (
    <View style={{ backgroundColor: light ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.07)', borderRadius: CARD_RADIUS, ...SMOOTH, overflow: 'hidden' }}>
      {children}
    </View>
  );
});

// Ideas for where a savings goal's money sits — not an exhaustive list or
// enum, just a fast path for the common cases (see the "Other" option every
// OptionsRow ends with). Debt has no equivalent "borrowed from" field any
// more — who a loan is from is normally already in its own name ("HDFC Bike
// Loan", "Ramesh — shop loan"), so asking for it as a second field was
// asking twice for the same fact.
const LOCATION_SUGGESTIONS = ['Bank', 'Liquid Fund', 'Chit Fund', 'Cash'];

// Add/Withdraw modes handed to AddModal (see MoneySheet below) — shown with the
// same sliding-pill switch as Home's own Expense/Income, since this really is
// that same sheet now, not a separately-built lookalike.
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
      <Text style={{ fontSize: FONT.body, color: textColor(light).primary }}>{label}</Text>
      {children}
    </Pressable>
  );
}

function RowValueText({ value, placeholder, light }) {
  return (
    <Text numberOfLines={1} style={{ fontSize: FONT.body, maxWidth: 190, color: value ? textColor(light).secondary : textColor(light).tertiary }}>
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
          style={[INPUT_TEXT_STYLE, { fontSize: FONT.body, textAlign: 'right', color: textColor(light).primary, minWidth: 120, paddingVertical: 0 }]}
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
            style={[INPUT_TEXT_STYLE, { fontSize: FONT.body, textAlign: 'right', color: textColor(light).primary, minWidth: 120, paddingVertical: 0 }]}
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

// A date, picked from an Apple-style Day/Month/Year wheel dropped inline
// below the row — the same "expands in place, inside the same card" shape
// OptionsRow's own wheel uses, rather than a separate modal/overlay (which
// is how AddModal's own date field works, but that's a full-screen sheet
// with room for one; this is one row among several in a card that already
// has to fit a keyboard-avoiding field open at a time). Unlike a calendar
// tap, a wheel has no single "pick" moment, so the row stays open until the
// header is tapped again to collapse it — same as OptionsRow's own wheel.
const DateRow = memo(function DateRow({ label, value, onChangeText, placeholder, light, open, onOpen, onClose }) {
  const headerPress = () => { if (open) onClose(); else onOpen(); };
  const display = value ? formatDateFull(value) : '';
  return (
    <View>
      <RowHeader label={label} light={light} onPress={headerPress}>
        <RowValueText value={display} placeholder={placeholder} light={light} />
      </RowHeader>
      {!!open && (
        <View style={{ paddingBottom: 8 }}>
          <DateWheelPicker value={value || today()} onChange={onChangeText} light={light} />
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
          style={[INPUT_TEXT_STYLE, { fontSize: FONT.body, textAlign: 'right', color: textColor(light).primary, minWidth: 100, paddingVertical: 0 }]}
        />
      ) : (
        <RowValueText value={display} placeholder={placeholder} light={light} />
      )}
    </RowHeader>
  );
});

// Fallback heights only. The sheet measures its own content and sizes
// itself to it (see `contentHeight` in GoalSheet's return) — these are what
// it uses for the frames before that measurement lands, which in practice
// means never, since the content stays mounted while the sheet is closed
// and has therefore already been measured by the time it opens.
//
// They used to BE the sizing, one hand-tuned ratio per state, and the
// comment here openly called them estimates against an actual device. That
// is exactly what went wrong: whatever a ratio guessed wrong became dead
// space inside the sheet — above the rows or below them, depending on which
// end the content was anchored to — and no amount of nudging the numbers
// removes a gap you can't see from here. Measuring has no slack to leave.
// Kept roughly right per state anyway, so even the fallback is close.
const DEBT_TYPE_STEP_HEIGHT_RATIO = 0.50;
const DEBT_FLEXIBLE_HEIGHT_RATIO = 0.50;
const DEBT_HEIGHT_RATIO = 0.83;
const SAVINGS_NEW_HEIGHT_RATIO = 0.62;
const SAVINGS_EDIT_HEIGHT_RATIO = 0.56;

// Reserved, up front, for whatever row's panel opens.
//
// A row's panel is deliberately allowed to grow past the sheet's own sizing
// — see the row list's own comment — which is fine for a row with real
// slack below it: the rows under it just reflow down, still inside the
// scroll view. It stops being fine once there's no slack left to reflow
// INTO — most visibly for the last row in the list (EMI debt's "First EMI",
// a DateRow whose day/month/year wheel is ~200px tall), which has nothing
// below it to push out of the way at all, but the same cliff is there for
// any row once the one still above the sheet's own bottom edge opens: with
// the sheet sized to exactly its collapsed content, there's nothing to grow
// into, and the opened panel (or whatever it pushed down) goes invisible the
// instant it opens, not just once scrolled past. Since only one row is ever
// open at a time (see `openField`), reserving the single tallest panel a
// form can show is enough to cover every row in it, not just the last one.
//
// One constant per form, sized to that form's own tallest expanding row —
// EMI debt's DateRow wheel is taller than its MonthsRulerRow ruler, so it
// sets EMI's reserve; Savings' only expanding row is "Where it's kept"
// (OptionsRow's own, shorter, 3-row wheel: WHEEL_H + its 8px padding).
// Flexible debt has nothing past a plain text row, which never expands, so
// it needs no reserve at all.
const EMI_LAST_ROW_RESERVE = 210;
const SAVINGS_LOCATION_RESERVE = 130;

// A new debt goal's own first question, before it even asks for a name —
// everything past this depends on the answer (see GoalSheet's own return
// below): an EMI/Loan has a fixed schedule this app can track and project
// from, a Flexible one doesn't and is tracked the plain running-balance way
// every debt goal used to work before this split existed. Two plain tiles,
// stacked rather than side by side — full-width reads easier for two short
// sentences of description than a cramped half-width column would — not a
// segmented toggle, since there's no "current selection" to hold once one
// is tapped, picking one just moves straight on to the rest of the form.
function DebtTypeOption({ label, description, onPress, light }) {
  return (
    <FieldCard light={light}>
      <GlassPressable variant="field" pressScale={false} onPress={onPress} style={{ padding: 16 }} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={{ fontSize: FONT.body, fontWeight: '600', color: light ? '#111111' : '#ffffff' }}>{label}</Text>
        <Text style={{ fontSize: FONT.caption, marginTop: 6, color: textColor(light).tertiary }}>{description}</Text>
      </GlassPressable>
    </FieldCard>
  );
}

function DebtTypeStep({ onSelect, light }) {
  return (
    // Natural height, for the same reason the field rows are (see their own
    // comment): this step's own height is what the sheet is sized to, so
    // there is no gap above or below the two tiles to begin with.
    <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
      <Text style={{ fontSize: FONT.body, color: textColor(light).secondary, marginBottom: 12 }}>What kind of debt is this?</Text>
      <View style={{ gap: 12 }}>
        <DebtTypeOption
          label="EMI / Loan"
          description="Car, bike, home, personal loan"
          onPress={() => onSelect('emi')}
          light={light}
        />
        <DebtTypeOption
          label="Flexible"
          description="Friend, family, informal"
          onPress={() => onSelect('flexible')}
          light={light}
        />
      </View>
    </View>
  );
}

// A plain reading of the loan's own numbers — no save needed first, this
// recalculates on every keystroke straight from the same state the fields
// above it are already holding (see GoalSheet's own render, not a separate
// fetch or a debounce). Hidden entirely until there's enough to say
// something real (all three of borrowed amount, EMI and tenure present) —
// half a sentence with blanks in it reads worse than nothing yet.
//
// Deliberately not called "interest" — the gap between what's borrowed and
// what's scheduled to be repaid may include other charges this app has no
// way to isolate, so it only ever says "extra you'll pay".
function LoanSummaryCard({ target, emiAmount, tenureMonths, light }) {
  const tenure = parseInt(tenureMonths, 10) || 0;
  if (!(target > 0) || !(emiAmount > 0) || !(tenure > 0)) return null;
  const totalRepayment = emiAmount * tenure;
  const extra = Math.max(0, totalRepayment - target);
  const primary = light ? '#111111' : '#ffffff';
  return (
    <ReanimatedView.View layout={FIELD_LAYOUT_TRANSITION} entering={FadeIn} style={{ overflow: 'hidden' }}>
      <FieldCard light={light}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: FONT.label, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: textColor(light).disabled, marginBottom: 12 }}>
            Loan summary
          </Text>
          <View className="flex-row items-baseline justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: FONT.caption, color: textColor(light).tertiary }}>You borrowed</Text>
            <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: primary, ...TABULAR }}>{money(target)}</Text>
          </View>
          <View className="flex-row items-baseline justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: FONT.caption, color: textColor(light).tertiary }}>You'll repay</Text>
            <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: primary, ...TABULAR }}>{money(totalRepayment)}</Text>
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text style={{ fontSize: FONT.caption, color: textColor(light).tertiary }}>Extra you'll pay</Text>
            <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: primary, ...TABULAR }}>{money(extra)}</Text>
          </View>
        </View>
      </FieldCard>
    </ReanimatedView.View>
  );
}

// A count of months, dialled in on the same ruler BudgetSetupModal's own
// amount field uses (AmountRuler, just handed a months scale instead of a
// currency one) with the same big figure above it, but closed behind a
// tap like every other row on this sheet rather than sitting open: picking
// "EMI / Loan" should land on a form of quiet rows, not on an already-open
// picker for whichever field happens to come first.
//
// Used for both month fields a loan has — the tenure and how many of those
// EMIs are already behind you. The second one passes `tintCompleted` (greens
// the stretch of ruler left of the line, see AmountRuler's own comment) and
// its own `maxMonths` — GoalSheet hands it the current tenure, so dragging
// it can never claim more EMIs paid than the loan is actually long.
//
// Collapsing it is safe to do now in a way it wasn't before — a closed
// ruler used to be the only thing keeping the sheet's swipe-to-dismiss from
// eating its drags, and that is fixed at the source (see AmountRuler's own
// comment on using gesture-handler's ScrollView), so `open` here is purely
// about what the form looks like, not about making the drag work.
//
// The ruler stays INSIDE the same card its header sits in, same as every
// other row's own expanding content (OptionsRow's wheel, DateRow's wheel) —
// it used to break out to true screen edges the way BudgetSetupModal's
// does, but that read as the control spilling out of its own section
// rather than opening within it, so there's no bleed margin here any more
// and the row's wrapper (GoalSheet's own return, below) is back to the
// plain `overflow: 'hidden'` every other row's wrapper already has.
function MonthsRulerRow({ label, value, onChange, session, light, open, onOpen, onClose, maxMonths, tintCompleted = false }) {
  const months = parseInt(value, 10) || 0;
  const unit = months === 1 ? 'month' : 'months';
  // Only built while this row is actually open. "EMIs already paid" is
  // capped at the tenure, so dragging the OTHER ruler changes this one's
  // `maxMonths` on every tick — and rebuilding the scale re-walks every
  // month of the loan into two SVG path strings, hundreds of segments,
  // dozens of times a second, on the same JS thread that drag's own tick
  // reports are queued on. Closed, there is nothing on screen to build it
  // for; open, the other ruler is necessarily closed (one panel at a time),
  // so `maxMonths` is sitting still anyway.
  const scale = useMemo(() => (open ? monthsScale(maxMonths) : null), [open, maxMonths]);
  // The ruler reports its value out and never takes one back in (see
  // AmountRuler's own comment), so it is handed the value this row held when
  // it OPENED, not the live one it is itself driving. Feeding the live value
  // back changed `initialValue` on every tick, which defeated the memo around
  // AmountRuler and re-rendered its whole tick/label SVG mid-drag.
  const openedValue = useRef(months);
  if (!open) openedValue.current = months;
  return (
    <FieldCard light={light}>
      <RowHeader label={label} light={light} onPress={open ? onClose : onOpen}>
        <RowValueText value={`${months} ${unit}`} light={light} />
      </RowHeader>
      {!!open && (
        <View style={{ paddingBottom: 14 }}>
          <View className="items-center mb-2">
            <Text style={{ fontSize: FONT.display, lineHeight: 50, fontWeight: '300', letterSpacing: -1, color: light ? '#111111' : '#ffffff', ...TABULAR }}>
              {months}
              <Text style={{ fontSize: FONT.title, fontWeight: '400', color: textColor(light).disabled }}> {unit}</Text>
            </Text>
          </View>
          <AmountRuler
            scale={scale}
            initialValue={openedValue.current}
            sessionKey={session}
            onChange={onChange}
            light={light}
            surface={light ? FIELD_CARD_SURFACE.light : FIELD_CARD_SURFACE.dark}
            tintCompleted={tintCompleted}
            // 'fast', not the amount ruler's own 'normal' — a loan runs at
            // most a few hundred months, every one of them a real tick
            // (nothing here is banded the way the amount ruler's own big
            // numbers are), so the same flick that barely dents a lakh-sized
            // amount carries for seconds across this much shorter, denser
            // scale — reading as the ruler spinning on past where the finger
            // actually meant to let go, rather than settling on the month
            // right under it.
            decelerationRate="fast"
          />
        </View>
      )}
    </FieldCard>
  );
}

// New goal / edit goal — one page, one card, every field a plain row —
// modelled directly on the Health/Clock reference (see the row primitives
// above): label left, value right, tap to expand or edit in place. Replaces
// both the earlier two-step wizard (reverted — a multi-step goal-creation
// flow has been tried and rejected here before) and the flat boxed-field
// single page that came after it.
export function GoalSheet({ open, onClose, onClosed, goal, initialName = '', onSubmit, light = false, kind = 'savings' }) {
  const isEdit = !!goal;
  const copy = KIND_COPY[kind];
  // Debt has no "where it's kept"/"borrowed from" field any more — see
  // LOCATION_SUGGESTIONS's own comment on why.
  const whereOptions = LOCATION_SUGGESTIONS;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [location, setLocation] = useState('');
  // A new debt goal starts with no type chosen at all — the very first
  // thing GoalSheet asks for (see the type-selector step in its own return
  // below) — everything past the name/amount depends on which one is
  // picked. An existing goal already has one (see useSavings.js's own
  // comment on how an old goal without one gets inferred one), fixed for
  // good the moment it's created — same as `kind` itself, this isn't
  // something an edit can change.
  const [debtType, setDebtType] = useState(null);
  const isEmiType = kind === 'debt' && debtType === 'emi';
  const [tenureMonths, setTenureMonths] = useState('');
  // Bumped alongside the field-reset effect below, each time the sheet
  // actually opens — tells both month rulers (AmountRuler's own `sessionKey`)
  // to jump back to whatever their field now holds instead of wherever they
  // were last dragged to. One counter for the pair: they only ever need to
  // reset together, at the moment the sheet opens.
  const [rulerSession, setRulerSession] = useState(0);
  const [emisPaidBefore, setEmisPaidBefore] = useState('');
  // Stable identities, not inline arrows — these reach AmountRuler, which is
  // memo'd, and GoalSheet re-renders on every tick of a drag (the value lives
  // in its state). A fresh function each render defeated that memo, so the
  // ruler rebuilt its whole SVG on every month it crossed.
  const handleTenureChange = useCallback(v => setTenureMonths(String(v)), []);
  // EMIs already paid can never be more than the loan's total EMIs — including
  // when the total is still zero (nothing set yet, so nothing can have been
  // paid). Enforced at every way it can change: the ruler, the tenure moving
  // under it, and the save itself.
  const tenureRef = useRef(0);
  tenureRef.current = parseInt(tenureMonths, 10) || 0;
  const handleEmisPaidChange = useCallback(v => setEmisPaidBefore(String(Math.min(Number(v) || 0, tenureRef.current))), []);
  // Dragging the tenure ruler down below however many EMIs were already
  // marked paid would otherwise leave that field pointing at a month the
  // loan no longer has (its own ruler, built off this same tenure, would
  // simply have no tick there any more) — pulled back down to the new
  // tenure the instant it drops below it, same direction a shrinking
  // dropdown would clamp a stale selection.
  useEffect(() => {
    const tenure = parseInt(tenureMonths, 10) || 0;
    const paid = parseInt(emisPaidBefore, 10) || 0;
    if (paid > tenure) setEmisPaidBefore(String(tenure));
  }, [tenureMonths, emisPaidBefore]);
  const [firstEmiDate, setFirstEmiDate] = useState('');
  const [emiAmount, setEmiAmount] = useState(0);
  const [emiEdited, setEmiEdited] = useState(false);
  const [startingAmount, setStartingAmount] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only one row's panel open at a time — same behaviour the reference
  // shows (opening Height's wheel closes Date of Birth's), not each row
  // managing its own independent expand state.
  const [openField, setOpenField] = useState(null);
  // Dismisses the keyboard, not just whatever text field happened to be
  // focused — opening a ruler or a wheel is switching to a NON-keyboard
  // control, so the keyboard should go the same way tapping blank space
  // already sends it away, not linger on screen until something later
  // happens to blur the text field for an unrelated reason.
  const openRow = (key) => { Keyboard.dismiss(); setOpenField(key); };
  const closeRow = () => setOpenField(null);

  // See DEBT_HEIGHT_RATIO's own comment — matches how many rows render
  // below, not `openField`. First EMI's own panel used to need a special
  // case here (a full month-grid calendar, tall enough to run past the
  // footer CTA on a shorter screen) — now that it's the same compact wheel
  // shape every other row's panel already is, it fits inside the normal
  // ratio like the rest and needs no bump of its own.
  const sheetHeightRatio = kind === 'debt'
    ? (!isEdit && !debtType ? DEBT_TYPE_STEP_HEIGHT_RATIO : debtType === 'flexible' ? DEBT_FLEXIBLE_HEIGHT_RATIO : DEBT_HEIGHT_RATIO)
    : (isEdit ? SAVINGS_EDIT_HEIGHT_RATIO : SAVINGS_NEW_HEIGHT_RATIO);

  // A text field taking focus (typing a custom name/location, or the
  // always-keyboard tenure/EMIs/exact-amount fields) closes whatever row's
  // picker panel is open — the same "only one thing expanded at a time"
  // rule `openRow` enforces between rows, extended to a row's own panel
  // vs. its text field.
  const focusField = useCallback((key) => {
    closeRow();
  }, []);

  // Keyboard avoidance is InlineSheet's job now, for every sheet rather than
  // this one alone — see its own comment on lifting by what it takes and no
  // more.

  // How tall this sheet's content actually is, handed to InlineSheet so it
  // can size itself to exactly that instead of to a hand-tuned share of the
  // screen. Two pieces, measured separately and added together (plus the
  // title's own marginBottom, which its own layout height excludes): the
  // title is a fixed header outside the scroll, and the row list below it
  // renders inside a GestureScrollView (see its own comment on why a plain
  // View stopped being enough), so its DESIRED height has to come from
  // `onContentSizeChange` — the content's own full size — rather than
  // `onLayout`, which on a scroll view reports the bounded VIEWPORT it was
  // actually given, not what its content would take if nothing clipped it.
  // Either number updates only while every row is COLLAPSED: an expanding
  // row deliberately outgrows the scroll viewport instead of resizing the
  // sheet to fit it (see the row list's own comment on why), so letting its
  // bigger height feed back here would defeat that on every single tap.
  const [titleH, setTitleH] = useState(0);
  const [bodyH, setBodyH] = useState(0);
  const openFieldRef = useRef(openField);
  openFieldRef.current = openField;
  const onTitleLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    setTitleH(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);
  // The type-selector step (DebtTypeStep) is plain content, not scrollable —
  // two tiles, short enough on any screen that it never needs to be — so it
  // measures the ordinary way.
  const onStepLayout = useCallback((e) => {
    if (openFieldRef.current) return;
    const h = e.nativeEvent.layout.height;
    setBodyH(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);
  const onRowsContentSize = useCallback((_w, h) => {
    if (openFieldRef.current) return;
    setBodyH(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);
  const rowReserve = isEmiType ? EMI_LAST_ROW_RESERVE : kind !== 'debt' ? SAVINGS_LOCATION_RESERVE : 0;
  const contentH = titleH > 0 && bodyH > 0
    ? titleH + 12 + bodyH + rowReserve
    : 0;

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
    // Already resolved by useSavings.js's own `derived` layer for an
    // existing goal (even one saved before the type split existed — see its
    // own comment on inferring one) — null only for a genuinely new debt
    // goal, which is exactly when the type-selector step below needs to ask.
    setDebtType(goal?.debtType ?? null);
    // '0', not '' — a slider always sits on some value (there's no "blank"
    // position to drag to), so the ruler and the field it drives have to
    // agree on a starting point from the first frame, rather than the ruler
    // showing one thing until the user happens to drag it. Zero until the user
    // sets it: the monthly EMI below stays at zero with it.
    setTenureMonths(goal?.tenureMonths ? String(goal.tenureMonths) : '0');
    setRulerSession(n => n + 1);
    setEmisPaidBefore(goal?.emisPaidBefore ? String(goal.emisPaidBefore) : '');
    // The same day next month, not blank, for a new loan. Left unset this field
    // reads as optional, but nothing downstream works without it: no first EMI
    // means no schedule to hang dates off, so the circle tracker doesn't render
    // at all and "Next payment" stays hidden. A loan added around the time it
    // starts has its first EMI due a month on (a 31st lands on the month's last
    // day), so that is the likeliest answer and one less field to go and fill
    // in; it is still a plain editable row.
    setFirstEmiDate(goal?.firstEmiDate || toDateStr(addMonths(parseISO(today()), 1)));
    setEmiAmount(goal?.emiAmount ?? 0);
    // An existing loan's EMI is its own — never recomputed under the user.
    // A new one's follows the borrowed amount and tenure until it is typed
    // over (see the effect below).
    setEmiEdited(!!goal?.emiAmount);
    setStartingAmount(0);
    setOpenField(null);
    setError('');
    setSubmitting(false);
  }, [open, goal, initialName]);

  // EMI debt's own three fields, required — not because a blank one looks
  // wrong, but because nothing downstream works without it. Tenure already
  // can't go blank (the ruler always sits on a value) and First EMI already
  // defaults to today (see its own reset-effect comment), so in practice
  // this only ever stops the one field that CAN be cleared out: Monthly EMI.
  // Leaving it blank used to submit fine and then go silently wrong — every
  // EMI logged against the loan divides by this to count as a whole
  // payment (see useSavings.js's own `emisPaid`), so a null EMI amount
  // meant payments kept landing in history while "remaining", "% paid" and
  // the tracker never moved, with nothing on screen saying why.
  const emiFieldsReady = !isEmiType || (parseInt(tenureMonths, 10) > 0 && emiAmount > 0 && !!firstEmiDate);
  const canSubmit = name.trim().length > 0 && amount > 0
    && (kind !== 'debt' || isEdit || !!debtType)
    && emiFieldsReady;

  // Monthly EMI, filled in from the borrowed amount spread over the tenure,
  // for as long as it hasn't been typed over. Left at "Not set" it isn't a
  // blank the user can simply skip — the EMI amount is what every figure on
  // the loan's page is built from ("left to pay", the paid count, the
  // tracker), so an unset one quietly produces a loan page with nothing on
  // it. A flat division ignores interest, which is exactly why it's only a
  // starting point: the Loan Summary card right below shows what it adds up
  // to, so a real EMI off the loan paperwork can be typed straight over it.
  const handleEmiAmountChange = useCallback((v) => { setEmiEdited(true); setEmiAmount(v); }, []);
  useEffect(() => {
    if (!isEmiType || emiEdited) return;
    const tenure = parseInt(tenureMonths, 10) || 0;
    setEmiAmount(tenure > 0 && amount > 0 ? Math.round(amount / tenure) : 0);
  }, [isEmiType, emiEdited, amount, tenureMonths]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    const tenure = isEmiType && parseInt(tenureMonths, 10) > 0 ? parseInt(tenureMonths, 10) : null;
    const paidBefore = isEmiType && parseInt(emisPaidBefore, 10) > 0 ? Math.min(parseInt(emisPaidBefore, 10), tenure || 0) : 0;
    const emiDate = isEmiType && firstEmiDate ? firstEmiDate : null;
    const emi = isEmiType && emiAmount > 0 ? emiAmount : null;
    const starting = !isEdit && kind === 'savings' && startingAmount > 0 ? startingAmount : 0;
    const result = await onSubmit({
      // Debt no longer has its own "borrowed from" field — clearing it here
      // (rather than just hiding the row) means editing an old loan that
      // still has one on file drops it for good the next time it's saved.
      name: name.trim(), target: amount, location: kind === 'debt' ? '' : location, kind,
      debtType: kind === 'debt' ? debtType : null,
      tenureMonths: tenure, emisPaidBefore: paidBefore, firstEmiDate: emiDate, emiAmount: emi, startingAmount: starting,
    });
    if (result?.success === false) {
      setSubmitting(false);
      if (!result.offline) setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }, [canSubmit, submitting, onSubmit, isEdit, kind, debtType, isEmiType, name, amount, location, tenureMonths, emisPaidBefore, firstEmiDate, emiAmount, startingAmount, onClose]);

  const insets = useSafeAreaInsets();
  const footer = (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 10 }}>
      {!!error && <Text className="text-red-400 text-[13px] text-center mb-2">{error}</Text>}
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
    // `heightRatio` is only the fallback for the one frame before the real
    // measurement lands (see contentH above) — the sheet is sized to its
    // content now, not to a guessed share of the screen, so there's nothing
    // left here to gate on `openField`.
    <InlineSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      light={light}
      heightRatio={sheetHeightRatio}
      contentHeight={contentH || null}
      dismissible={!submitting && !openField}
      footer={footer}
    >
      <View style={{ flex: 1 }}>
      <View onLayout={onTitleLayout} style={{ minHeight: 22, justifyContent: 'center', marginBottom: 12, paddingHorizontal: 20 }}>
        <Text className="text-center font-semibold" style={{ fontSize: FONT.body, color: textColor(light).primary }}>
          {isEdit ? copy.sheetTitleEdit : copy.sheetTitleNew}
        </Text>
        {/* Only reachable past the type-selector step, for a brand-new debt
            goal — editing an existing one never shows this (its type is
            fixed, see `debtType`'s own comment), and the selector step
            itself has nothing to go back to. Resets straight to `null`
            rather than a history stack — there's only ever the one step
            behind this one. `left: 20` (this View's own paddingHorizontal),
            not `0` — lines the arrow up with the field cards below rather
            than sitting flush against the sheet's bare edge. */}
        {kind === 'debt' && !isEdit && !!debtType && (
          <Pressable
            onPress={() => setDebtType(null)}
            hitSlop={12}
            style={{ position: 'absolute', left: 20, top: 0, bottom: 0, justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronRight size={16} color={textColor(light).secondary} />
            </View>
          </Pressable>
        )}
      </View>

      {kind === 'debt' && !isEdit && !debtType ? (
        <View onLayout={onStepLayout}>
          <DebtTypeStep onSelect={setDebtType} light={light} />
        </View>
      ) : (
      // A GestureScrollView, not a plain View — the row list used to never
      // scroll, full stop, on purpose: a nested ScrollView's own vertical
      // drag can contest a wheel/ruler's own gesture for the same touch (see
      // the wheel/ruler's own PanResponder comments on losing that fight
      // before), and removing it outright was what guaranteed that could
      // never happen again. But a kind/state combination whose rows simply
      // don't fit even fully COLLAPSED — EMI debt's six fields plus the Loan
      // Summary card, on a shorter screen — had no scroll to fall back on
      // either, so its last rows (EMIs already paid, First EMI) rendered
      // past the sheet's own edge with no way to reach them at all. Scoped
      // narrowly to avoid reopening the old conflict: `scrollEnabled` is off
      // the instant any row opens its own panel, which is exactly the state
      // that drags a wheel or a ruler, so this scroller is never live at the
      // same time as one of those gestures — only in the plain "tap a
      // collapsed row" state, same as every tap on this list already was.
      //
      // From gesture-handler, like AmountRuler's own scroller — plain
      // React Native's ScrollView is invisible to the arena InlineSheet's
      // own swipe-to-dismiss pan negotiates in (see AmountRuler's comment
      // for the long version), so this is what lets a drag inside the list
      // properly contest that pan instead of losing to it outright.
      //
      // `onContentSizeChange`, not a wrapping `onLayout` — this view's own
      // rendered height is now bounded to whatever space is actually left
      // (`flex: 1`, resolved against the sheet InlineSheet computed), which
      // can be smaller than its content; the content's own full size is
      // what the sizing calculation above needs, and only the scroll
      // view's own callback reports that regardless of how it's bounded.
      //
      // Each field is its own Card, not rows sharing one — a separate
      // rounded card per field with a gap between them, matching the
      // reference screenshot's own Filters sheet (Location/Price/Dates/
      // Time each their own card) rather than one grouped list with
      // internal hairlines.
      <GestureScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}
        scrollEnabled={!openField}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onContentSizeChange={onRowsContentSize}
      >
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <TextRow
              label={kind === 'debt' ? 'Debt name' : copy.namePlaceholder}
              value={name}
              onChangeText={setName}
              placeholder="Not set"
              light={light}
              maxLength={60}
              autoCapitalize="sentences"
              onFocusRow={() => focusField('name')}
            />
          </FieldCard>
          </ReanimatedView.View>
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <AmountTextRow
              label={isEmiType ? 'Total loan amount' : kind === 'debt' ? 'Amount owed' : 'Target amount'}
              value={amount}
              onChangeValue={setAmount}
              placeholder="Set amount"
              light={light}
              onFocusRow={() => focusField('amount')}
            />
          </FieldCard>
          </ReanimatedView.View>
          {kind !== 'debt' && (
          <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
          <FieldCard light={light}>
            <OptionsRow
              label="Where it's kept"
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
          )}
          {isEmiType ? (
            <>
              <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
                <MonthsRulerRow
                  label="Total EMIs"
                  value={tenureMonths}
                  onChange={handleTenureChange}
                  session={rulerSession}
                  light={light}
                  open={openField === 'tenure'}
                  onOpen={() => openRow('tenure')}
                  onClose={closeRow}
                />
              </ReanimatedView.View>
              <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
              <FieldCard light={light}>
                <AmountTextRow
                  label="Monthly EMI"
                  value={emiAmount}
                  onChangeValue={handleEmiAmountChange}
                  placeholder="Not set"
                  light={light}
                  onFocusRow={() => focusField('emiAmount')}
                />
              </FieldCard>
              </ReanimatedView.View>
              <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
                <MonthsRulerRow
                  label="EMIs already paid"
                  value={emisPaidBefore}
                  onChange={handleEmisPaidChange}
                  session={rulerSession}
                  light={light}
                  open={openField === 'emisPaid'}
                  onOpen={() => openRow('emisPaid')}
                  onClose={closeRow}
                  maxMonths={parseInt(tenureMonths, 10) || 0}
                  tintCompleted
                />
              </ReanimatedView.View>
              {/* Only labels the calendar ("Next payment", "Estimated
                  finish" — see useSavings.js's own derivation) — EMIs
                  already paid above is what actually drives progress, not
                  this date. */}
              <ReanimatedView.View layout={rowsReady ? FIELD_LAYOUT_TRANSITION : undefined} style={{ overflow: 'hidden' }}>
              <FieldCard light={light}>
                <DateRow
                  label="First EMI"
                  value={firstEmiDate}
                  onChangeText={setFirstEmiDate}
                  placeholder="Not set"
                  light={light}
                  open={openField === 'firstEmiDate'}
                  onOpen={() => openRow('firstEmiDate')}
                  onClose={closeRow}
                />
              </FieldCard>
              </ReanimatedView.View>
              <LoanSummaryCard target={amount} emiAmount={emiAmount} tenureMonths={tenureMonths} light={light} />
            </>
          ) : kind === 'debt' ? null : !isEdit && (
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
      </GestureScrollView>
      )}
      </View>
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

export function MoneySheet({ open, onClose, onClosed, goalName, goal, entry, initialType = 'add', maxWithdraw = 0, onSubmit, closeEarly = false, light = false, kind = 'savings' }) {
  const isEdit = !!entry;

  // AddModal's own {type, amount, date, description} shape, mapped to and
  // from this sheet's {type, amount, date, note} — a savings/debt entry has
  // a "note", not a "description", everywhere else it's used.
  const editData = entry ? { type: entry.type, amount: entry.amount, date: entry.date, description: entry.note } : null;

  // A brand-new EMI payment already has a known amount — the loan's own
  // monthly EMI, or, for a pre-closure (`closeEarly`), the loan's own
  // `remaining` — and a description that's just the loan's name, same as
  // what `useEmiExpenseConfirm` already writes to Home's expense list for
  // this exact payment. Filled in so logging a payment is mostly a confirm,
  // not a re-type of numbers already on file; only for a fresh entry
  // (`isEdit` false — an edit already has its own real values via
  // `editData` above) and only for EMI debt, which is the only kind with
  // these fields at all.
  //
  // `remaining` is a SUGGESTION here, not a lock the way the monthly EMI
  // amount effectively is — a real foreclosure figure almost never matches
  // `emisRemaining × emiAmount` exactly (a bank's own fee or discount isn't
  // something this app's schedule math knows about), so it has to stay
  // freely editable, not just prefilled.
  //
  // The date defaults to today, not the loan's own schedule-derived
  // `nextEmiDate`. A loan whose paid count sits behind its schedule has a
  // `nextEmiDate` in a past month, and this payment is the one being made
  // right now — it belongs in the current month, not in whichever month the
  // schedule is still catching up to. Which EMI it settles doesn't depend on
  // this date anyway: the count comes from the money (see useSavings.js's
  // `emisPaid`), and the tracker fills in schedule order.
  const isEmiDebt = kind === 'debt' && goal?.debtType === 'emi';
  const prefill = !isEdit && isEmiDebt
    ? { amount: (closeEarly ? goal.remaining : goal.emiAmount) || 0, date: today(), description: goalName }
    : undefined;
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
      prefill={prefill}
      modes={kind === 'debt' ? DEBT_MONEY_MODES : MONEY_MODES}
      labels={MONEY_LABELS}
      initialMode={initialType}
      subtitle={goalName}
      fieldPlaceholder="Note (optional)"
      fieldRequired={false}
      extraValidate={validateWithdraw}
      light={light}
    />
  );
}
