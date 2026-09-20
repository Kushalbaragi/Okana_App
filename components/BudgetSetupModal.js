import { memo, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { GlassPressable, POPUP_RADIUS, SMOOTH, CARD_RADIUS } from './Glass';
import { NumericKeypad } from './NumericKeypad';
import { useAmountEntry } from '../hooks/useAmountEntry';
import { AmountRow } from './AmountField';
import AmountRuler, { RulerFigure, BUDGET_SCALE } from './AmountRuler';
import { TrendArrowIcon } from './icons';
import { SuccessBadge } from './SuccessBadge';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { FLAGS } from '../utils/flags';
import { hapticAdded } from '../utils/haptics';
import { SETTLE_EASING } from '../utils/motion';

// Same drag-to-dismiss tuning as AddModal — one consistent feel for every
// bottom-sheet page in the app.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const OFF_SCREEN_Y = 1200;

// A bottom sheet the height of its content, on the same surface, corners,
// backdrop and timing as the new-goal sheet (InlineSheet) — so the two read as
// one family.
const SHEET_COLOR = '#161616';
const BACKDROP_MAX_OPACITY = 0.55;
const OPEN_MS = 340;
const CLOSE_MS = 240;

// Where the ruler starts when there is no previous month to carry over — a
// visible suggestion to adjust, not a blank to fill in.
const DEFAULT_BUDGET = 20000;

// How long the "you set X more/less" confirmation holds on screen before
// auto-redirecting home — long enough to actually read, short enough not to
// feel stuck.
const CONFIRM_HOLD_MS = 6000;
// Same idea for the first-ever-budget greeting, at the 5s the request asked
// for specifically.
const FIRST_BUDGET_HOLD_MS = 5000;

function lastMonthMessage(lastMonthAmount, lastMonthSpent) {
  if (lastMonthAmount == null) {
    if (!lastMonthSpent) return null;
    return {
      stat: `You spent ${formatCurrency(lastMonthSpent)}`,
      hint: 'No budget was set — pick one this month to stay in control.',
      color: 'rgba(255,255,255,0.4)',
    };
  }
  const over = lastMonthSpent > lastMonthAmount;
  return {
    stat: `${formatCurrency(lastMonthSpent)} of ${formatCurrency(lastMonthAmount)} budget`,
    hint: over
      ? `You went over by ${formatCurrency(lastMonthSpent - lastMonthAmount)} — try aiming lower this time.`
      : 'You stayed within budget. Keep it up.',
    color: over ? 'rgba(248,113,113,0.9)' : 'rgba(74,222,128,0.9)',
  };
}

function BudgetSetupModal({ open, onClose, onClosed, onSubmit, lastMonthAmount, lastMonthSpent }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { month: currMonth } = currentMonthYear();

  // A string either way, so the keypad path and the ruler path share the
  // submit logic below. With the ruler it starts as last month's budget — the
  // natural starting point, so leaving it untouched just keeps things as they
  // were — and `session` tells the ruler to go back there on each open.
  const rulerOn = FLAGS.budgetRuler;
  const startValue = lastMonthAmount ?? DEFAULT_BUDGET;
  const { amount, prevAmountLength, skipDigitAnim, onKeyPress: handleKeypadPress, setProgrammatic: setAmountProgrammatically } = useAmountEntry(rulerOn ? String(startValue) : '');
  const [session, setSession] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set once the budget is saved AND it differs from last month's — holds
  // the delta (amount + direction) to show instead of the form, for
  // CONFIRM_HOLD_MS before auto-closing. Null means "show the form".
  const [confirmDelta, setConfirmDelta] = useState(null);
  const confirmProgress = useSharedValue(0);

  // Same "keep the native Modal mounted through the close animation" setup
  // as AddModal — see the comment there for why.
  const [visible, setVisible] = useState(open);
  const pageTranslateY = useSharedValue(windowHeight);
  const dragY = useSharedValue(0);

  // Same submit-in-flight protection as AddModal — see the comments there.
  // A budget set is the one place here that genuinely can't be silently
  // lost: skipping it means the whole point of setting a budget (the
  // confirmation, and the delta screen) never happens, with no sign
  // anything went wrong.
  //
  // Deliberately its own flag, not `submitting` — `submitting` stays true
  // through the whole post-submit confirmation screen too (to avoid a
  // button-label flicker), but that screen is meant to stay drag-
  // dismissible early (see the CONFIRM_HOLD_MS effect's own comment
  // below); only the actual in-flight request should block dismissal.
  const requestInFlightSV = useSharedValue(false);
  const requestInFlightRef = useRef(false); // JS-side mirror for handleRequestClose (plain function, not a worklet)
  const sessionRef = useRef(0);
  useEffect(() => { if (open) sessionRef.current += 1; }, [open]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      dragY.value = 0;
      pageTranslateY.value = withTiming(0, { duration: OPEN_MS, easing: SETTLE_EASING });
    } else {
      pageTranslateY.value = withTiming(
        windowHeight,
        { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) },
        finished => {
          if (!finished) return;
          runOnJS(setVisible)(false);
          if (onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setAmountProgrammatically(rulerOn ? String(startValue) : '');
      setSession(n => n + 1);
      setError('');
      setSubmitting(false);
      setConfirmDelta(null);
      confirmProgress.value = 0;
    }
  }, [open]);

  // Holds the confirmation screen up for CONFIRM_HOLD_MS (or
  // FIRST_BUDGET_HOLD_MS for the first-ever-budget greeting), then
  // redirects home — cleared if the sheet gets dragged shut early instead.
  useEffect(() => {
    if (!confirmDelta) return;
    const t = setTimeout(onClose, confirmDelta.greeting ? FIRST_BUDGET_HOLD_MS : CONFIRM_HOLD_MS);
    return () => clearTimeout(t);
  }, [confirmDelta, onClose]);

  async function handleSubmit() {
    // Belt-and-suspenders alongside the button's own `disabled` prop — see
    // login.js's identical guard for why: React's state update isn't
    // synchronous, so a fast double-tap could otherwise fire this twice
    // before `submitting` re-renders the button disabled.
    if (submitting) return;
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const mySession = sessionRef.current;
    setSubmitting(true);
    setError('');
    requestInFlightSV.value = true;
    requestInFlightRef.current = true;
    const result = await onSubmit(val);
    requestInFlightSV.value = false;
    requestInFlightRef.current = false;
    // Closed and reopened while this was in flight — belongs to a session
    // the user can no longer see. See AddModal's handleSubmit for the
    // same guard and why it's needed.
    if (sessionRef.current !== mySession) return;
    if (result?.success === false) {
      setSubmitting(false);
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    // A queued (offline) set is still a success here — same as adding a
    // transaction offline, it applies locally and syncs once reconnected;
    // useBudget's setBudget already showed the offline banner.
    hapticAdded();
    if (lastMonthAmount != null && val !== lastMonthAmount) {
      confirmProgress.value = withTiming(1, { duration: 520, easing: SETTLE_EASING });
      setConfirmDelta({ diff: Math.abs(val - lastMonthAmount), up: val > lastMonthAmount });
    } else if (lastMonthAmount == null) {
      // No prior month to compare against — this is their first budget, so
      // greet them instead of silently closing with no feedback at all.
      confirmProgress.value = withTiming(1, { duration: 520, easing: SETTLE_EASING });
      setConfirmDelta({ greeting: true, amount: val });
    } else {
      onClose();
    }
  }

  // Ignored while the actual request is in flight — see requestInFlightSV
  // above for why this isn't just `submitting`.
  function handleRequestClose() {
    if (requestInFlightRef.current) return;
    onClose();
  }

  const canSubmit = !!amount && parseFloat(amount) > 0 && !submitting;
  const recap = lastMonthMessage(lastMonthAmount, lastMonthSpent);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onUpdate(e => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd(e => {
      const pastThreshold = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (pastThreshold && !requestInFlightSV.value) {
        dragY.value = withTiming(OFF_SCREEN_Y, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) });
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: SETTLE_EASING });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pageTranslateY.value + dragY.value }],
  }));

  // Fades in step with the slide, like AddModal's.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: (1 - Math.min(1, Math.max(0, (pageTranslateY.value + dragY.value) / windowHeight))) * BACKDROP_MAX_OPACITY,
  }));

  // The form stays mounted (holding the sheet at its height) and fades out as
  // the confirmation fades in over it, so the sheet doesn't jump between sizes.
  const formStyle = useAnimatedStyle(() => ({ opacity: 1 - confirmProgress.value }));

  const confirmStyle = useAnimatedStyle(() => ({
    opacity: confirmProgress.value,
    transform: [
      { scale: 0.92 + confirmProgress.value * 0.08 },
      { translateY: (1 - confirmProgress.value) * 12 },
    ],
  }));

  if (!visible) return null;

  const confirmRGB = confirmDelta?.up ? '248,113,113' : '74,222,128';
  const confirmColor = `rgba(${confirmRGB},0.9)`;
  const confirmBg = `rgba(${confirmRGB},0.14)`;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleRequestClose}>
      {/* A Modal is a separate native hierarchy, so the app-root gesture root
          doesn't reach in here — see AddModal. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} accessibilityLabel="Close" />
          </Animated.View>

          <Animated.View
            pointerEvents={open ? 'auto' : 'none'}
            style={[
              {
                position: 'absolute', left: 0, right: 0, bottom: 0,
                backgroundColor: SHEET_COLOR,
                borderTopLeftRadius: POPUP_RADIUS, borderTopRightRadius: POPUP_RADIUS, ...SMOOTH,
                overflow: 'hidden',
              },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View>
                <Animated.View style={formStyle} pointerEvents={confirmDelta ? 'none' : 'auto'}>
                  <View style={{ paddingTop: 10, paddingBottom: 16, alignItems: 'center' }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                  </View>

                  <Text className="text-white text-lg font-semibold text-center mb-2 px-6">
                    Set your {MONTH_NAMES[currMonth]} budget
                  </Text>
                  <Text className="text-white/50 text-base text-center mb-6 px-6" style={{ lineHeight: 22 }}>
                    How much do you want to spend this month?
                  </Text>

                  {rulerOn ? (
                    <>
                      <View className="items-center mb-2">
                        <RulerFigure value={parseFloat(amount) || 0} />
                      </View>

                      {/* Edge to edge, so the ticks can run off both sides of the screen. */}
                      <AmountRuler
                        scale={BUDGET_SCALE}
                        initialValue={startValue}
                        sessionKey={session}
                        onChange={v => setAmountProgrammatically(String(v))}
                        surface={SHEET_COLOR}
                      />
                    </>
                  ) : (
                    <View className="items-center mb-6">
                      <AmountRow amount={amount} prevAmountLength={prevAmountLength} skipDigitAnim={skipDigitAnim} />
                    </View>
                  )}

                  {recap && (
                    <View className="px-6" style={{ marginTop: rulerOn ? 24 : 0 }}>
                      <View
                        className="px-4 py-3 w-full"
                        style={{
                          maxWidth: 320, alignSelf: 'center', borderRadius: CARD_RADIUS, ...SMOOTH, borderWidth: 1,
                          // The same recessed fill the new-goal sheet's fields use.
                          backgroundColor: 'rgba(0,0,0,0.18)', borderColor: 'rgba(255,255,255,0.07)',
                        }}
                      >
                        <Text className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1.5">Last month</Text>
                        <Text className="text-white text-base font-medium mb-1">{recap.stat}</Text>
                        <Text className="text-sm" style={{ color: recap.color, lineHeight: 18 }}>{recap.hint}</Text>
                      </View>
                    </View>
                  )}

                  {!!error && <Text className="text-red-400 text-base text-center mx-5 mt-4">{error}</Text>}

                  <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: rulerOn ? Math.max(insets.bottom, 8) + 12 : 20 }}>
                    <GlassPressable
                      variant="active"
                      radius={9999}
                      disabled={!canSubmit}
                      onPress={handleSubmit}
                      className="w-full py-[14px] items-center"
                    >
                      <Text className="text-black text-base font-semibold">{submitting ? 'Setting…' : 'Set Budget'}</Text>
                    </GlassPressable>
                  </View>

                  {!rulerOn && <NumericKeypad onKeyPress={handleKeypadPress} insetBottom={insets.bottom} />}
                </Animated.View>

                {confirmDelta && (
                  // Over the whole sheet, so it centres on the sheet rather than
                  // on what is left below the grabber.
                  <Animated.View
                    style={[
                      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
                      confirmStyle,
                    ]}
                  >
                    {confirmDelta.greeting ? (
                      <>
                        <SuccessBadge style={{ marginBottom: 24 }} />
                        <Text className="text-white text-lg font-semibold text-center" style={{ lineHeight: 26 }}>
                          You set {formatCurrency(confirmDelta.amount)} budget{'\n'}for {MONTH_NAMES[currMonth]}. Stick with it!
                        </Text>
                      </>
                    ) : (
                      <>
                        <View
                          className="items-center justify-center mb-6"
                          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: confirmBg }}
                        >
                          <TrendArrowIcon up={confirmDelta.up} color={confirmColor} size={28} />
                        </View>
                        <Text className="text-white text-lg font-semibold text-center" style={{ lineHeight: 26 }}>
                          You decided to spend{'\n'}{formatCurrency(confirmDelta.diff)} {confirmDelta.up ? 'more' : 'less'} this month
                        </Text>
                      </>
                    )}
                  </Animated.View>
                )}
              </View>
            </GestureDetector>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default memo(BudgetSetupModal);
