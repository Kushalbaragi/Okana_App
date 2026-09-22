import { View, Text } from 'react-native';
import { ChevronRight } from './icons';
import { GlassPressable, CARD_RADIUS, SMOOTH } from './Glass';
import { textColor } from '../utils/colors';

// Shared list-building-block components for Account/Subscription — a grey
// rounded Card containing Rows separated by hairline Dividers, each Row
// optionally chevron'd. Both screens had their own near-identical copies of
// these (only Account's threaded a `light` experiment flag); pulled out
// here so a future visual tweak (radius, border color, spacing) only needs
// to happen once instead of drifting between the two.
//
// `light` mirrors the one-off LIGHT_HOME/LIGHT_SETTINGS theme experiment —
// screens that don't have that experiment (Subscription) just never pass
// it, defaulting to the normal dark look.

export function Divider({ light = false }) {
  return <View style={{ height: 1, backgroundColor: light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

// `action` is an optional element that sits right beside the label (e.g. a
// small refresh button) — every existing caller just omits it and gets the
// exact same plain label as before; only Subscription's "Current Plan" needs
// the row layout.
export function SectionLabel({ children, light = false, action = null }) {
  const label = (
    <Text
      className="text-[11px] font-medium uppercase tracking-widest px-1 pt-2 mb-2"
      style={{ color: textColor(light).disabled }}>{children}</Text>
  );
  if (!action) return label;
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      {label}
      {action}
    </View>
  );
}

export function Card({ children, light = false }) {
  return (
    <View
      className="overflow-hidden"
      style={{
        borderRadius: CARD_RADIUS,
        ...SMOOTH,
        backgroundColor: light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
      }}
    >
      {children}
    </View>
  );
}

// `accessibilityLabel` defaults to `label` — every settings-style row gets a
// sensible VoiceOver/TalkBack label for free unless a caller needs to
// override it (e.g. a row whose visible label alone doesn't say enough).
export function Row({ label, value, onPress, right, labelColor, light = false, accessibilityLabel }) {
  const content = (
    <View className="flex-row items-center justify-between px-4 py-[14px]">
      <Text className="text-base" style={{ color: labelColor || (light ? '#111111' : '#ffffff') }}>{label}</Text>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        {!!value && <Text className="text-xs" style={{ color: textColor(light).tertiary }}>{value}</Text>}
        {right || (onPress && !right && <ChevronRight color={light ? 'rgba(0,0,0,0.25)' : undefined} />)}
      </View>
    </View>
  );
  return onPress ? (
    // variant="field" — transparent background, same look as the plain
    // Pressable this used to be, but with GlassPressable's animated
    // press-opacity instead of no press feedback at all. pressScale={false}
    // because these rows sit flush inside a bordered Card: shrinking one
    // pulls it visibly away from the card's own edges and the dividers
    // above/below it, which the smaller controls this component was built
    // for never had to contend with.
    <GlassPressable
      variant="field"
      pressScale={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      {content}
    </GlassPressable>
  ) : content;
}
