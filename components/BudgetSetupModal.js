import { memo, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { GlassPressable, GlassView } from './Glass';
import { NumericKeypad } from './NumericKeypad';
import { AmountRow, SETTLE_EASING } from './AmountField';
import { TrendArrowIcon, CheckIcon } from './icons';
import { formatCurrency, currentMonthYear } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';

// Same drag-to-dismiss tuning as AddModal — one consistent feel for every
// bottom-sheet page in the app.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const OFF_SCREEN_Y = 1200;

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

  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set once the budget is saved AND it differs from last month's — holds
  // the delta (amount + direction) to show instead of the form, for
  // CONFIRM_HOLD_MS before auto-closing. Null means "show the form".
  const [confirmDelta, setConfirmDelta] = useState(null);
  const confirmProgress = useSharedValue(0);

  const prevAmountLengthRef = useRef(0);
  const prevAmountLength = prevAmountLengthRef.current;
  useEffect(() => {
    prevAmountLengthRef.current = amount.length;
  });
  const skipDigitAnimRef = useRef(true);

  function handleKeypadPress(key) {
    Haptics.selectionAsync();
    skipDigitAnimRef.current = false;
    setAmount(prev => {
      if (key === 'backspace') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : `${prev}.`;
      }
      if (prev === '0') return key;
      const decimals = prev.split('.')[1];
      if (decimals != null && decimals.length >= 2) return prev;
      if (prev.replace('.', '').length >= 9) return prev;
      return prev + key;
    });
  }

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
      pageTranslateY.value = withTiming(0, { duration: 950, easing: SETTLE_EASING });
    } else {
      pageTranslateY.value = withTiming(
        windowHeight,
        { duration: 420, easing: SETTLE_EASING },
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
      skipDigitAnimRef.current = true;
      setAmount('');
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const nativeScroll = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .simultaneousWithExternalGesture(nativeScroll)
    .onUpdate(e => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd(e => {
      const pastThreshold = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (pastThreshold && !requestInFlightSV.value) {
        dragY.value = withTiming(OFF_SCREEN_Y, { duration: 420, easing: SETTLE_EASING });
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 380, easing: SETTLE_EASING });
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pageTranslateY.value + dragY.value }],
  }));

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
      <Animated.View className="flex-1 bg-bg" style={pageStyle} pointerEvents={open ? 'auto' : 'none'}>
      <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + 10, paddingBottom: 24, alignItems: 'center' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </View>

        {confirmDelta ? (
          <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }, confirmStyle]}>
            {confirmDelta.greeting ? (
              <>
                <View
                  className="items-center justify-center mb-6"
                  style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(74,222,128,0.14)' }}
                >
                  <CheckIcon size={30} />
                </View>
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
        ) : (
          <>
            <GestureDetector gesture={nativeScroll}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 24 }}
            >
              <Text className="text-white text-lg font-semibold text-center mb-2">
                Set your {MONTH_NAMES[currMonth]} budget
              </Text>
              <Text className="text-white/50 text-base text-center mb-8" style={{ lineHeight: 22 }}>
                How much do you want to spend this month?
              </Text>

              <View className="items-center mb-8">
                <AmountRow amount={amount} prevAmountLength={prevAmountLength} skipDigitAnim={skipDigitAnimRef.current} />
              </View>

              {recap && (
                <GlassView variant="glass" radius={16} className="px-4 py-3 w-full" style={{ maxWidth: 320, alignSelf: 'center' }}>
                  <Text className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1.5">Last month</Text>
                  <Text className="text-white text-base font-medium mb-1">{recap.stat}</Text>
                  <Text className="text-sm" style={{ color: recap.color, lineHeight: 18 }}>{recap.hint}</Text>
                </GlassView>
              )}
            </ScrollView>
            </GestureDetector>

            {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-3">{error}</Text>}
            <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              <GlassPressable
                variant="active"
                radius={16}
                disabled={!canSubmit}
                onPress={handleSubmit}
                className="w-full py-[14px] items-center"
              >
                <Text className="text-black text-base font-semibold">{submitting ? 'Setting…' : 'Set Budget'}</Text>
              </GlassPressable>
            </View>

            <NumericKeypad onKeyPress={handleKeypadPress} insetBottom={insets.bottom} />
          </>
        )}
      </View>
      </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

export default memo(BudgetSetupModal);
