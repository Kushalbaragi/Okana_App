import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, Keyboard, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Spinner } from './icons';
import { darkText } from '../utils/colors';
import { GUTTER } from '../utils/spacing';
import { FONT } from '../utils/type';

// The pieces the sign-in pages (email, code, name) and the pages after them are
// made of, so they all look like the welcome slides: the same background, the
// same title in the same place, one soft field, one white button.

// The same background as the subscription page and the welcome slides.
const BACKGROUND = require('../assets/subscription-bg.webp');
const BACKGROUND_OPACITY = 0.35;

export function AuthBackground() {
  return <Image source={BACKGROUND} contentFit="cover" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: BACKGROUND_OPACITY }]} />;
}

// Where a title sits: the same height as the welcome slides' titles (the status
// bar, the row at the top, then a gap).
export function useTitleTop() {
  const insets = useSafeAreaInsets();
  return insets.top + 12 + 36 + 56;
}

export function AuthTitle({ title, sub }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: GUTTER }}>
      <Text style={{ fontSize: FONT.title, fontWeight: '600', color: '#ffffff', textAlign: 'center' }}>{title}</Text>
      {!!sub && <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 10, lineHeight: 19, textAlign: 'center' }}>{sub}</Text>}
    </View>
  );
}

const ICON = 'rgba(255,255,255,0.45)';
export function MailIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={14} rx={3} />
      <Path d="M4 7.5l8 6 8-6" />
    </Svg>
  );
}
export function PersonIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8.5} r={3.6} />
      <Path d="M5 19.5c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
    </Svg>
  );
}

// A soft filled field, in the style of Apple's own sign-in forms: a faint
// translucent fill, a hairline border, an icon on the left and, once something
// is typed, a small clear button on the right.
export function AuthField({ icon, value, onChangeText, onClear, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        marginHorizontal: GUTTER, height: 56, borderRadius: 16, borderCurve: 'continuous',
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: focused ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)',
      }}
    >
      {icon}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="rgba(255,255,255,0.3)"
        selectionColor="#0a84ff"
        style={{ flex: 1, fontSize: FONT.body, color: '#ffffff', paddingVertical: 0, includeFontPadding: false }}
        {...props}
      />
      {!!value && (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear">
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="#000000" strokeWidth={1.6} strokeLinecap="round">
              <Path d="M2 2l6 6M8 2l-6 6" />
            </Svg>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// The one button on these pages: a white pill, grey while there is nothing to
// continue with yet.
export function PillButton({ label, onPress, disabled, dim, loading, loadingLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={{
        height: 48, borderRadius: 9999, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 8, marginHorizontal: GUTTER,
        backgroundColor: dim ? 'rgba(255,255,255,0.12)' : '#ffffff',
      }}
    >
      {loading && <Spinner color={dim ? '#ffffff' : '#000000'} trackColor="rgba(0,0,0,0.25)" />}
      <Text style={{ fontSize: FONT.body, fontWeight: '500', color: dim ? 'rgba(255,255,255,0.85)' : '#000000' }}>
        {loading && loadingLabel ? loadingLabel : label}
      </Text>
    </Pressable>
  );
}

// A paddingBottom that follows the keyboard, so a button pinned to the bottom
// rides on top of it. Tracked manually rather than via KeyboardAvoidingView — see
// AnimatedModal.js for why. With no keyboard it rests above the home indicator.
export function useKeyboardLift(rest = 16) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const offset = useSharedValue(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  useEffect(() => {
    offset.value = withTiming(keyboardHeight, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [keyboardHeight, offset]);
  const bottom = insets.bottom;
  return useAnimatedStyle(() => ({ paddingBottom: Math.max(offset.value, bottom) + rest }));
}
