import { BlurView } from 'expo-blur';
import { View, Pressable, TextInput, StyleSheet } from 'react-native';

// Mirrors the web app's .glass / .glass-active / .glass-modal CSS classes —
// backdrop-filter has no RN equivalent, so these layer a BlurView behind a
// semi-transparent tint to approximate the same glassmorphism look.
const TINT = {
  glass: 'rgba(255,255,255,0.07)',
  active: 'rgba(255,255,255,0.14)',
  modal: 'rgba(14,14,14,0.80)',
};
const INTENSITY = { glass: 24, active: 28, modal: 40 };

// Tailwind's rounded-* scale, so call sites can pass the same vocabulary
// they'd use in a className elsewhere in the app.
export const RADIUS = { none: 0, sm: 6, md: 8, lg: 10, xl: 12, '2xl': 16, '3xl': 24, full: 9999 };

// expo-blur's BlurView doesn't reliably clip to an ancestor's
// `overflow: hidden` on iOS (a UIVisualEffectView quirk) — rounding only the
// wrapper leaves the blur itself sharp-cornered. The fix is to set the same
// borderRadius directly on the BlurView (and the tint overlay) too, not just
// the outer container.
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
    <View style={[{ overflow: 'hidden' }, r, style]} className={className} {...props}>
      <BlurView intensity={INTENSITY[variant]} tint="dark" style={[StyleSheet.absoluteFill, r]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT[variant] }, r]} />
      {children}
    </View>
  );
}

export function GlassPressable({ variant = 'active', radius = RADIUS.xl, corners, style, className, children, disabled, ...props }) {
  const r = radiusStyle(radius, corners);
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        { overflow: 'hidden', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        r,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      className={className}
      {...props}
    >
      <BlurView intensity={INTENSITY[variant]} tint="dark" style={[StyleSheet.absoluteFill, r]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT[variant] }, r]} />
      {children}
    </Pressable>
  );
}

export function GlassTextInput({ radius = RADIUS.xl, style, className, inputClassName, ...props }) {
  const r = radiusStyle(radius);
  return (
    <View style={[{ overflow: 'hidden' }, r, style]} className={className}>
      <BlurView intensity={INTENSITY.glass} tint="dark" style={[StyleSheet.absoluteFill, r]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT.glass }, r]} />
      <TextInput
        placeholderTextColor="#333333"
        className={inputClassName || 'text-white text-sm px-4 py-3'}
        {...props}
      />
    </View>
  );
}
