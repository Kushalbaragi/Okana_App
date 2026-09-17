import { View, Pressable, TextInput, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Flat, solid surfaces — no BlurView/backdrop-filter. Replaces the previous
// glassmorphism look (translucent tint over a real-time blur), which read as
// muddy/inconsistent on Android's software-rendered blur path.
// Exported so pill toggles that set this same color inline (Header's chart
// tabs, AddModal's Expense/Income toggle) can share one source of truth
// instead of duplicating the hex.
export const PILL_ACTIVE_COLOR = '#3a3a3a';

const BG = {
  glass: '#161616',  // regular cards, secondary buttons/pills
  modal: '#161616',  // bottom sheets / modal surfaces — same solid surface color throughout, deliberately
  active: '#d4d4d4', // primary CTAs — one consistent treatment app-wide
  pillActive: PILL_ACTIVE_COLOR, // "this option is selected" state on segmented pill toggles
  field: 'transparent', // bordered form-field surfaces (inputs, date pickers) — outline only, no fill
};

// Tailwind's rounded-* scale, so call sites can pass the same vocabulary
// they'd use in a className elsewhere in the app.
export const RADIUS = { none: 0, sm: 6, md: 8, lg: 10, xl: 12, '2xl': 16, '3xl': 24, full: 9999 };

function radiusStyle(radius, corners) {
  if (!radius) return null;
  if (!corners) return { borderRadius: radius };
  const style = {};
  if (corners.includes('t')) { style.borderTopLeftRadius = radius; style.borderTopRightRadius = radius; }
  if (corners.includes('b')) { style.borderBottomLeftRadius = radius; style.borderBottomRightRadius = radius; }
  return style;
}

export function GlassView({ variant = 'glass', radius = 0, corners, style, className, children, ...props }) {
  const r = radiusStyle(radius, corners);
  return (
    <View style={[{ backgroundColor: BG[variant] }, r, style]} className={className} {...props}>
      {children}
    </View>
  );
}

// Press feedback used to be an instant opacity snap (Pressable's own
// `pressed` render-prop, applied straight to a style object) — every button
// built on this component (NumericKeypad's every single key, AddModal's
// Add/Update CTA, BudgetSetupModal, login/name, the range-selector pills)
// popped between 1 and 0.85 with zero transition. Animating it here, once,
// is what makes all of those feel smooth instead of tweaking each call site.
const PRESS_IN_DURATION = 90;
const PRESS_OUT_DURATION = 180;
// Small enough to read as "pressed" without the button visibly jumping —
// same shrink-on-press feel NumericKeypad's own keys already use.
const PRESS_SCALE = 0.96;

export function GlassPressable({ variant = 'active', radius = RADIUS.xl, corners, style, className, children, disabled, onPressIn, onPressOut, ...props }) {
  const r = radiusStyle(radius, corners);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const handlePressIn = (e) => {
    opacity.value = withTiming(0.85, { duration: PRESS_IN_DURATION });
    scale.value = withTiming(PRESS_SCALE, { duration: PRESS_IN_DURATION });
    onPressIn?.(e);
  };
  const handlePressOut = (e) => {
    opacity.value = withTiming(1, { duration: PRESS_OUT_DURATION });
    // A light spring back to 1 rather than a linear withTiming — it
    // overshoots slightly past full size before settling, reading as a
    // bit of "give" on release instead of a flat stop.
    scale.value = withSpring(1, { damping: 12, stiffness: 220 });
    onPressOut?.(e);
  };

  const animStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.5 : opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[{ overflow: 'hidden' }, r, animStyle, typeof style === 'function' ? style({ pressed: false }) : style]}
      className={className}
      {...props}
    >
      {/* A separate absolutely-positioned background layer, not a
          backgroundColor on the Pressable's own (function-based) style —
          NativeWind's className handling doesn't reliably compose with a
          dynamic style function, and silently drops the color when both are
          present on the same element. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BG[variant] }, r]} />
      {children}
    </AnimatedPressable>
  );
}

export function GlassTextInput({ radius = RADIUS.xl, style, className, inputClassName, ...props }) {
  const r = radiusStyle(radius);
  return (
    <View
      style={[{ backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }, r, style]}
      className={className}
    >
      <TextInput
        placeholderTextColor="#4d4d4d"
        textAlignVertical="center"
        className={inputClassName || "text-white text-base px-4 py-3.5"}
        {...props} />
    </View>
  );
}
