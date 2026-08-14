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

export function GlassView({ variant = 'glass', style, className, children, ...props }) {
  return (
    <View style={[{ overflow: 'hidden' }, style]} className={className} {...props}>
      <BlurView intensity={INTENSITY[variant]} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT[variant] }]} />
      {children}
    </View>
  );
}

export function GlassPressable({ variant = 'active', style, className, children, disabled, ...props }) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        { overflow: 'hidden', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      className={className}
      {...props}
    >
      <BlurView intensity={INTENSITY[variant]} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT[variant] }]} />
      {children}
    </Pressable>
  );
}

export function GlassTextInput({ style, className, inputClassName, ...props }) {
  return (
    <View style={[{ overflow: 'hidden', borderRadius: 12 }, style]} className={className}>
      <BlurView intensity={INTENSITY.glass} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT.glass }]} />
      <TextInput
        placeholderTextColor="#333333"
        className={inputClassName || 'text-white text-sm px-4 py-3'}
        {...props}
      />
    </View>
  );
}
