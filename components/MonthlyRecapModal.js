import { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, BackHandler, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, runOnJS, Easing, cancelAnimation } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import ShimmerQuote from './ShimmerQuote';
import { CheckIcon } from './icons';
import { cardFill } from './savingsShared';
import { useAuth } from '../context/AuthContext';
import { money } from '../utils/summaryFacts';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { EMPTY_SUMMARY_HISTORY, pickSummaryMessage } from '../utils/summaryMessages';
import { storageKeys } from '../utils/storageKeys';
import { reportError } from '../utils/errors';
import { darkText, EXPENSE_HEX, INCOME_HEX } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';

// The same background as the welcome pages.
const BACKGROUND = require('../assets/subscription-bg.webp');
const BACKGROUND_OPACITY = 0.35;
const AMBER = '#fbbf24';

// How long each slide stays: long enough for its lines to come in one by one and be read.
const SLIDE_MS = 9000;
// Below this, a press+release counts as a tap (navigate) rather than a
// hold (pause-and-resume-in-place) — matches the feel of Instagram/
// WhatsApp status taps, where a normal tap is well under this.
const HOLD_THRESHOLD_MS = 200;

function ProgressSegment({ state, paused }) {
  // state: 'done' | 'active' | 'pending'
  const progress = useSharedValue(state === 'done' ? 1 : 0);
  const prevStateRef = useRef(state);

  useEffect(() => {
    const becameActive = state === 'active' && prevStateRef.current !== 'active';
    prevStateRef.current = state;

    if (state !== 'active') {
      progress.value = state === 'done' ? 1 : 0;
      return;
    }
    if (becameActive) progress.value = 0;

    if (paused) {
      // Freezes the fill exactly where it is — a held segment stays
      // partially filled instead of continuing or resetting.
      cancelAnimation(progress);
    } else {
      // Resumes from wherever it's currently sitting, over only the time
      // that's actually left, rather than replaying the full duration.
      const remaining = (1 - progress.value) * SLIDE_MS;
      progress.value = withTiming(1, { duration: remaining, easing: Easing.linear });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, paused]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="flex-1 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.22)' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: 'white', borderRadius: 999 }, style]} />
    </View>
  );
}

// Each line of a slide comes in on its own, a beat after the one before it: a short slide
// up and fade, `step` places down the line.
const REVEAL_STEP_MS = 300;
const REVEAL_MS = 600;
// Lines only come in the first time a slide is reached. Coming back to it shows it as it
// was left, already in place.
const RevealContext = createContext(true);
function Reveal({ step = 0, duration = REVEAL_MS, style, children }) {
  const animate = useContext(RevealContext);
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    progress.value = withDelay(step * REVEAL_STEP_MS, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [animate, progress, step, duration]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

// The summary slides in from the right as a page of its own, and back out the same way.
const PAGE_SPRING = { duration: 500, dampingRatio: 1, overshootClamping: true };

const LABEL = { fontSize: FONT.label, letterSpacing: 0.9, textTransform: 'uppercase', color: darkText.disabled, textAlign: 'center' };

// Every slide is laid out the same way, so the eye never has to look for anything: the
// title sits at the same height on every slide, a little above the middle of the screen,
// and what the slide says starts right under it. Only the lines under the title animate.
// `quiet` makes the title a small grey kicker, for a slide whose content is the point, and
// `lower` sets that slide a little further down.
const TITLE_TOP = 0.2;

function Frame({ title, gap = 36, quiet = false, lower = 30, children }) {
  const { height } = useWindowDimensions();
  return (
    <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: Math.round(height * TITLE_TOP) + lower }}>
      {/* Only the closing slide's title carries the slow light passing over it. */}
      {!!title && (quiet
        ? <ShimmerQuote text={title.toUpperCase()} color={darkText.primary} size={FONT.label} lineHeight={14} center textStyle={{ letterSpacing: LABEL.letterSpacing }} />
        : <Text style={{ fontSize: FONT.title, lineHeight: 26, color: darkText.primary, textAlign: 'center' }}>{title}</Text>)}
      <View style={{ marginTop: !title ? 0 : quiet ? 16 : gap }}>{children}</View>
    </View>
  );
}

function Bar({ percent, color }) {
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 10 }}>
      <View style={{ height: '100%', width: `${Math.max(2, Math.min(100, percent))}%`, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

// 0. The opening slide: just which month this is, in green, before the numbers start.
function IntroSlide({ monthLabel, year }) {
  return (
    // Centred on the whole screen: the bars and close button above take about 100pt, so
    // the same is left free at the bottom.
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 100 }]}>
      <Reveal>
        <Text style={{ fontSize: FONT.title, lineHeight: 28, color: INCOME_HEX, textAlign: 'center' }}>
          {monthLabel} {year} summary
        </Text>
      </Reveal>
    </View>
  );
}

// 1. How much was spent, against last month and the budget.
function SpentSlide({ spent, prevSpent, prevLabel, budgetAmount, overBy, underBy }) {
  const diff = spent - prevSpent;
  const hasBudget = budgetAmount != null;
  return (
    // "You spent" and the amount read as one phrase, so they sit close together.
    <Frame title="You spent" gap={6}>
      <View style={{ alignItems: 'center' }}>
        <Reveal step={1}>
          <Text style={{ fontSize: FONT.display, lineHeight: 52, fontWeight: '400', letterSpacing: -1.75, color: darkText.primary, ...TABULAR }}>{money(spent)}</Text>
        </Reveal>
        {prevSpent > 0 && diff !== 0 && (
          <Reveal step={2}>
            <Text style={{ fontSize: FONT.caption, marginTop: 8, color: diff < 0 ? INCOME_HEX : EXPENSE_HEX }}>
              {diff < 0 ? `${money(-diff)} less than ${prevLabel}` : `${money(diff)} more than ${prevLabel}`}
            </Text>
          </Reveal>
        )}
      </View>
      {hasBudget && (
        <Reveal step={3} style={{ marginTop: 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: FONT.caption, color: darkText.secondary }}>Budget {money(budgetAmount)}</Text>
            {overBy > 0 && <Text style={{ fontSize: FONT.caption, color: EXPENSE_HEX }}>{money(overBy)} over</Text>}
            {underBy > 0 && <Text style={{ fontSize: FONT.caption, color: INCOME_HEX }}>{money(underBy)} left</Text>}
          </View>
          <Bar percent={budgetAmount > 0 ? (spent / budgetAmount) * 100 : 100} color={overBy > 0 ? EXPENSE_HEX : INCOME_HEX} />
        </Reveal>
      )}
    </Frame>
  );
}

// 2 and 3. Up to three facts, each with a tick or an alert icon. A line can carry a `tip`
// (what to do about it), shown in grey under it.
function LinesSlide({ title, lines, tone }) {
  return (
    <Frame title={title}>
      {/* The list is centred on the slide as one block, its lines still reading from
          the left. Narrower than the slide, so long lines wrap and the block still
          reads as centred rather than filling the width. */}
      <View style={{ alignSelf: 'center', maxWidth: '86%' }}>
        {lines.map((item, i) => {
          const line = typeof item === 'string' ? { text: item } : item;
          return (
          <Reveal key={line.text} step={i + 1} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: line.tip ? 22 : 18 }}>
            <View style={{ width: 16, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              {tone === 'good'
                ? <CheckIcon size={14} color={INCOME_HEX} />
                : <Feather name="alert-circle" size={15} color={AMBER} />}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: FONT.body, lineHeight: 22, color: darkText.primary }}>{line.text}</Text>
              {!!line.tip && <Text style={{ fontSize: FONT.caption, lineHeight: 19, color: darkText.secondary, marginTop: 3 }}>{line.tip}</Text>}
            </View>
          </Reveal>
          );
        })}
      </View>
    </Frame>
  );
}

// 4. EMIs, the closest goal and the debt-free date, as small cards.
function BiggerSlide({ cards }) {
  return (
    <Frame title="Your bigger picture">
      {cards.map((c, i) => (
        <Reveal key={c.label} step={i + 1} style={{ backgroundColor: cardFill(false), borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 }}>
          <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}>{c.label}</Text>
          <Text style={{ fontSize: FONT.body, fontWeight: '500', color: darkText.primary, marginTop: 2 }}>{c.value}</Text>
          {c.percent != null && <Bar percent={c.percent} color={c.tone === 'amber' ? AMBER : INCOME_HEX} />}
          {!!c.note && <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 2 }}>{c.note}</Text>}
        </Reveal>
      ))}
    </Frame>
  );
}

// 5. One closing message. It is picked when the summary opens (see useSummaryMessage), so
// it is already there when this slide appears instead of popping in a moment later.
function MessageSlide({ message }) {
  // The title is there at once; the message follows as soon as it has been picked.
  if (!message) return <Frame title="One last thing" quiet lower={110}><View /></Frame>;
  return (
    <Frame title="One last thing" quiet lower={110}>
      {/* The message is what this slide is for, so it comes in at once and quickly. */}
      <Reveal duration={400}>
        <Text style={{ fontSize: FONT.body, lineHeight: 24, color: darkText.primary, textAlign: 'center' }}>{message.text}</Text>
      </Reveal>
    </Frame>
  );
}

// 6. Only for someone with no budget yet for the month that has just begun: the button is
// the whole slide, and the summary stays on it until they act.
function BudgetSlide({ onOpenBudgetSetup }) {
  const month = MONTH_NAMES[new Date().getMonth()];
  return (
    // Centred like the opening slide.
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 100 }]}>
      <Reveal>
        <GlassPressable variant="active" radius={9999} onPress={onOpenBudgetSetup} className="px-6 py-[14px]">
          <Text style={{ fontSize: FONT.body, fontWeight: '600', color: '#000000' }}>Set {month} budget</Text>
        </GlassPressable>
      </Reveal>
    </View>
  );
}

// Picks the closing message for this summary: the same month always gets the same one, and
// a new month avoids what was shown lately (see summaryMessages.js).
function useSummaryMessage(open, slides) {
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const slide = slides.find(s => s.type === 'message');
  useEffect(() => {
    if (!open || !slide) { setMessage(null); return undefined; }
    let cancelled = false;
    (async () => {
      const key = storageKeys.summaryHistory(user?.id);
      let history = EMPTY_SUMMARY_HISTORY;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) history = { ...EMPTY_SUMMARY_HISTORY, ...JSON.parse(raw) };
      } catch { /* a history that can't be read only means a message may repeat sooner */ }
      const picked = pickSummaryMessage(slide.candidates, history, slide.monthId);
      if (cancelled) return;
      setMessage(picked.message);
      if (picked.history !== history) AsyncStorage.setItem(key, JSON.stringify(picked.history)).catch(reportError);
    })();
    return () => { cancelled = true; };
  }, [open, slide, user?.id]);
  return message;
}

function Slide({ slide, message, onOpenBudgetSetup }) {
  switch (slide.type) {
    case 'intro': return <IntroSlide {...slide} />;
    case 'spent': return <SpentSlide {...slide} />;
    case 'wins': return <LinesSlide {...slide} title="What went well" tone="good" />;
    case 'improve': return <LinesSlide {...slide} title="What to improve" tone="watch" />;
    case 'bigger': return <BiggerSlide {...slide} />;
    case 'message': return <MessageSlide message={message} />;
    case 'budget': return <BudgetSlide onOpenBudgetSetup={onOpenBudgetSetup} />;
    default: return null;
  }
}

function MonthlyRecapModal({ open, slides, instant = false, onClose, onOpenBudgetSetup }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  // How much of this slide's SLIDE_MS budget is left, and when the
  // currently-running countdown last (re)started — together these let a
  // pause/resume cycle pick up from exactly where it left off instead of
  // either losing the elapsed time or replaying the full duration.
  const remainingRef = useRef(SLIDE_MS);
  const startedAtRef = useRef(0);
  const timedIndexRef = useRef(-1);
  const pressRef = useRef({ time: 0, x: 0 });
  const message = useSummaryMessage(open, slides);
  // A slide plays its lines in the first time it is reached; after that (going back, or
  // forward again over it) it shows them already in place, until the summary is reopened.
  const seenUpToRef = useRef(-1);
  const firstVisit = index > seenUpToRef.current;
  useEffect(() => { seenUpToRef.current = Math.max(seenUpToRef.current, index); }, [index]);

  const pageX = useSharedValue(width);
  const closingRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    // Opened from a notification, it is simply there (the backdrop was already showing);
    // otherwise it slides in from the right.
    pageX.value = instant ? 0 : width;
    if (!instant) pageX.value = withSpring(0, PAGE_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const finishClose = useCallback(() => onClose(), [onClose]);
  // Slides back out to the right, then tells the parent it is closed.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    pageX.value = withSpring(width, PAGE_SPRING, finished => {
      if (finished) runOnJS(finishClose)();
    });
  }, [pageX, width, finishClose]);
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pageX.value }] }));

  // The hardware back button closes the summary, rather than leaving the app from under it.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { requestClose(); return true; });
    return () => sub.remove();
  }, [open, requestClose]);

  useEffect(() => {
    if (open) { seenUpToRef.current = -1; setIndex(0); setPaused(false); }
  }, [open]);

  useEffect(() => {
    if (!open || !slides.length) return;
    if (timedIndexRef.current !== index) {
      remainingRef.current = SLIDE_MS;
      timedIndexRef.current = index;
    }
    if (paused) { clearTimeout(timerRef.current); return; }
    // The last slide stays until the person acts: a tap, the close button or Set budget.
    if (index >= slides.length - 1) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => setIndex(index + 1), remainingRef.current);
    return () => clearTimeout(timerRef.current);
  }, [open, index, slides.length, paused]);

  if (!open || !slides.length) return null;

  const slide = slides[index];

  function goTo(i) {
    if (i < 0 || i >= slides.length) { requestClose(); return; }
    setIndex(i);
  }

  function handlePressIn(e) {
    pressRef.current = { time: Date.now(), x: e.nativeEvent.locationX };
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    setPaused(true);
  }

  function handlePressOut() {
    const heldMs = Date.now() - pressRef.current.time;
    setPaused(false);
    // A real hold just resumes in place — only a quick tap navigates.
    if (heldMs < HOLD_THRESHOLD_MS) {
      if (pressRef.current.x < width / 2) goTo(index - 1);
      else goTo(index + 1);
    }
  }

  return (
    // Above everything on Home, the wallet page included (it opens from there too).
    <Animated.View className="absolute inset-0" style={[{ backgroundColor: '#000000', zIndex: 250, elevation: 250 }, pageStyle]}>
      <Image source={BACKGROUND} contentFit="cover" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: BACKGROUND_OPACITY }]} />
      <View className="flex-row px-3 pt-14" style={{ gap: 6 }}>
        {slides.map((s, i) => (
          <ProgressSegment key={i} state={i < index ? 'done' : i === index ? 'active' : 'pending'} paused={paused} />
        ))}
      </View>

      {/* A separate row below the progress bar, Instagram-style, rather
          than sharing its row — sits outside the full-screen tap area
          below (a sibling, not an overlay), so it's always reachable
          regardless of hold/tap state. */}
      <View className="flex-row items-center justify-between px-3" style={{ paddingTop: 10 }}>
        {/* Where the account name sits on a story: the month this summary is about. */}
        <Text style={{ fontSize: FONT.caption, fontWeight: '500', color: darkText.secondary, paddingLeft: 2 }}>{slides[0]?.monthLabel} {slides[0]?.year} summary</Text>
        <Pressable onPress={requestClose} hitSlop={10}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24 }}>✕</Text>
        </Pressable>
      </View>

      <Pressable className="flex-1" onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {/* Keyed by position, so a slide that reuses the last one's layout (What went
            well, then What to improve) still plays its lines in from the start. */}
        <RevealContext.Provider value={firstVisit}>
          <Slide key={index} slide={slide} message={message} onOpenBudgetSetup={onOpenBudgetSetup} />
        </RevealContext.Provider>
      </Pressable>
    </Animated.View>
  );
}

export default memo(MonthlyRecapModal);
