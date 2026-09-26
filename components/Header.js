import { memo, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { HamburgerIcon, WalletIcon } from './icons';
import { textColor } from '../utils/colors';
import { SPRING_SMOOTH } from '../utils/motion';

// The three labels sit on one fixed-order track (Expense, Income, Overview,
// always in that order); tapping Expense or Overview directly is what moves
// it — no drag any more. The physical sliding-under-a-fixed-window look
// (and its clipping effect) stays exactly as it was, it's just the trigger
// that changed: a tap now sets `mode` straight to that destination, and the
// track glides there as the transition, rather than a finger dragging the
// track itself and picking whichever slot it lands nearest to. `mode` is
// still owned by index.js and never persisted.
const MODES = ['expense', 'income', 'overview'];
const MODE_LABELS = { expense: 'Expense', income: 'Income', overview: 'Overview' };

// "Overview" is the long pole — still fits at 72px with the smaller 12px
// bold uppercase now in use. Tighter than the original 82px on purpose:
// less gap between the box and its resting neighbour on either side. The
// container is exactly one slot wider than the full three-slot track's own
// width would need at either end, so the currently-inactive neighbour
// toward the middle always has some peek showing; the neighbour two slots
// away is fully off the visible window at the two extremes (Expense,
// Overview) — an honest consequence of a real track being wider than a
// header can give it room to show all at once, the same way a picker wheel
// only ever shows what's near center.
const SLOT = 72;
const CONTAINER_WIDTH = SLOT * MODES.length;
// The box's own padding around its text — grows the box past the bare
// SLOT/BASE_TRACK_HEIGHT it'd otherwise exactly match, on top of and
// besides the reel's own per-slot spacing (SLOT itself stays untouched, so
// the track's alignment math below doesn't shift).
const BOX_PAD_V = 4;
const BOX_PAD_H = 3;
const BASE_TRACK_HEIGHT = 26;
const TRACK_HEIGHT = BASE_TRACK_HEIGHT + BOX_PAD_V * 2;
const BOX_WIDTH = SLOT + BOX_PAD_H * 2;

function indexOffset(i) {
  return -(i * SLOT + SLOT / 2);
}

// The always-visible, never-clipped copy of the track — small and dim,
// this is the "resting off to the side" look for whichever two modes
// aren't active, and also where the actual taps land: each slot is its own
// Pressable now, since there's no drag surface to claim the touch instead.
// Its sibling below (inside the boxed window) is a second, bright/bold copy
// of these same three labels driven by the identical transform; that copy
// is what visibly clips as it glides under the box's edge, since it —
// unlike this one — sits inside an overflow:'hidden' box no wider than one
// slot. No fade, no swap: same track, same motion, just two different
// windows onto it.
function DimReel({ trackStyle, light, onSelectMode }) {
  return (
    <Animated.View
      style={[{ position: 'absolute', left: CONTAINER_WIDTH / 2, top: 0, height: '100%', flexDirection: 'row' }, trackStyle]}
    >
      {MODES.map(m => (
        <Pressable key={m} onPress={() => onSelectMode(m)} style={{ width: SLOT, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '500', color: textColor(light).disabled, letterSpacing: 0.1 }}>
            {MODE_LABELS[m]}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

function ModeSlider({ mode, onSelectMode, light }) {
  const offset = useSharedValue(indexOffset(MODES.indexOf(mode)));

  // The only place `offset` changes now — a tap sets `mode` in index.js,
  // which round-trips back down as this prop, and this is what turns that
  // into the glide. SPRING_SMOOTH: calmer and slightly slower than a snappy
  // spring, so the move reads as one smooth glide to its new spot.
  useEffect(() => {
    offset.value = withSpring(indexOffset(MODES.indexOf(mode)), SPRING_SMOOTH);
  }, [mode, offset]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View style={{ width: CONTAINER_WIDTH, height: TRACK_HEIGHT, overflow: 'hidden' }}>
      <DimReel trackStyle={trackStyle} light={light} onSelectMode={onSelectMode} />

      {/* The fixed window — a soft fill, no border, sitting on top of the
          dim reel and clipping its own bright copy underneath. Purely
          visual, no touch handling of its own — nothing to tap here since
          it's already showing the current selection. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: CONTAINER_WIDTH / 2 - BOX_WIDTH / 2,
          top: 0,
          width: BOX_WIDTH,
          height: TRACK_HEIGHT,
          // Half the height, not a fixed radius — a true capsule/pill,
          // the same fully-rounded shape iOS's own segmented control uses
          // for its selected-segment indicator.
          borderRadius: TRACK_HEIGHT / 2,
          // Matches the transaction ledger's own month-header pill
          // (rgba(255,255,255,0.06) dark / rgba(0,0,0,0.05) light — see
          // MonthHeader in TransactionList.js) — but as the SOLID colour
          // that translucent fill composites to over this screen's actual
          // page background (pure black / #FAFAF8), not the rgba itself.
          // A see-through fill here would let the dim reel's own copy of
          // the active label show through from underneath, doubling up
          // with the bright copy on top of it right where they overlap.
          backgroundColor: light ? '#eeeeec' : '#0f0f0f',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ position: 'absolute', left: BOX_WIDTH / 2, top: 0, height: '100%', flexDirection: 'row' }, trackStyle]}
        >
          {MODES.map(m => (
            <View key={m} style={{ width: SLOT, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {/* Neutral for all three, active or not — the box itself
                  (position, fill, weight, uppercase) already says which
                  one is selected; red/green stay reserved for the chart
                  and don't need repeating here too. */}
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: textColor(light).primary }}>
                {MODE_LABELS[m]}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — not a real app-wide theme system, so it's threaded
// through as a plain prop rather than a context. Every other screen keeps
// passing nothing (defaults to the normal dark look).
function Header({ onMenuOpen, onCalendarOpen, mode, onSelectMode, light = false }) {
  // Safe-area-aware — a fixed pt-6 isn't enough clearance under the status
  // bar / notch / Dynamic Island on real devices (fine in the web preview,
  // which has no such concept, but overlapped the status bar on-device).
  const insets = useSafeAreaInsets();
  const iconColor = light ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';

  return (
    <View className="flex-row items-center justify-between pb-5 px-5" style={{ paddingTop: insets.top + 16 }}>
      <Pressable
        onPress={onMenuOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <HamburgerIcon color={iconColor} />
      </Pressable>

      {/* Same width on both side buttons (w-9) is what centres this
          perfectly via justify-between, with no absolute positioning
          needed — see the row's own layout math. */}
      <ModeSlider mode={mode} onSelectMode={onSelectMode} light={light} />

      <Pressable
        onPress={onCalendarOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open budget and savings"
      >
        <WalletIcon color={iconColor} />
      </Pressable>
    </View>
  );
}

export default memo(Header);
