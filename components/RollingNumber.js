import { View, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { seg, soft } from '../utils/timeline';

// A glyph can overhang its own text box a little (the rupee sign does, in a light
// weight at this size), and the native Text clips what overhangs. A pixel or two
// of padding on every cell keeps it whole.
// The matching negative margin cancels it out of the layout, so the digits keep
// their normal spacing.
const GLYPH_ROOM = { paddingHorizontal: 2, marginHorizontal: -2 };

// One character position of a rolling number: the old character slides up and
// out while the new one slides in from below, together, inside a box one line
// tall so nothing shows outside it.
function RollChar({ oldCh, newCh, ms, range, style, lh }) {
  const oldStyle = useAnimatedStyle(() => {
    const p = seg(ms.value, range);
    return { opacity: 1 - p, transform: [{ translateY: -lh * p }] };
  });
  const newStyle = useAnimatedStyle(() => {
    const p = seg(ms.value, range);
    return { opacity: p, transform: [{ translateY: lh * (1 - p) }] };
  });
  const place = [style, { position: 'absolute', left: 0, right: 0, textAlign: 'center' }];
  return (
    <View style={{ height: lh, overflow: 'hidden', justifyContent: 'center', ...GLYPH_ROOM }}>
      {/* Invisible, only to give the box its width. */}
      <Text style={[style, { opacity: 0 }]}>{newCh || oldCh}</Text>
      <Animated.Text style={[...place, oldStyle]}>{oldCh}</Animated.Text>
      <Animated.Text style={[...place, newStyle]}>{newCh}</Animated.Text>
    </View>
  );
}

// How long the row takes to open (or close) room for a digit that appears (or
// goes), before the digits roll.
const SLIDE_MS = 500;

// A character position that exists in only one of the two numbers. Its box
// opens from nothing to the character's own width (or closes back to nothing),
// so the row grows smoothly and everything beside it — the ₹ — slides aside
// instead of the room being there, empty, from the start.
function SlidingCell({ oldCh, newCh, ms, slide, roll, style, lh }) {
  const full = useSharedValue(0);
  const growing = newCh !== '';
  const wrapStyle = useAnimatedStyle(() => {
    const open = soft(ms.value, slide);
    return { width: full.value * (growing ? open : 1 - open) };
  });
  return (
    <>
      {/* The character's natural width, measured here — outside the box that is
          still closed — because inside it the text would be measured against a
          width of zero. */}
      <Text
        onLayout={(e) => { full.value = e.nativeEvent.layout.width - 4; }}
        style={[style, GLYPH_ROOM, { position: 'absolute', opacity: 0 }]}
      >
        {newCh || oldCh}
      </Text>
      <Animated.View style={[{ height: lh, overflow: 'hidden' }, wrapStyle]}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: 60, flexDirection: 'row' }}>
          <RollChar oldCh={oldCh} newCh={newCh} ms={ms} range={roll} style={style} lh={lh} />
        </View>
      </Animated.View>
    </>
  );
}

// A number that changes digit by digit: only the characters that differ
// (lined up from the right) roll, the rest — the ₹, the commas, a digit that
// stays the same — sit still. 26 → 25 rolls just the 6. When the number gains
// or loses a digit (₹99,400 → ₹1,00,000) the row first opens (or closes) the
// room for it, sliding the ₹ aside, and only then do the digits roll.
export default function RollingNumber({ from, to, ms, range, style, lh }) {
  // A shared leading symbol (the ₹) stays put. Left in the digit alignment, a
  // number that grows a digit lines the ₹ up against a different character and
  // rolls it, clipped, as it goes.
  const prefixFrom = from.match(/^\D*/)[0];
  const prefix = prefixFrom === to.match(/^\D*/)[0] ? prefixFrom : '';
  const a = Array.from(from.slice(prefix.length)).reverse();
  const b = Array.from(to.slice(prefix.length)).reverse();
  const n = Math.max(a.length, b.length);
  const gains = b.length > a.length;
  const loses = a.length > b.length;
  // Gaining a digit: slide first, then roll. Losing one: roll first, then slide.
  const slide = gains ? [range[0], range[0] + SLIDE_MS] : [range[1], range[1] + SLIDE_MS];
  const roll = gains ? [range[0] + SLIDE_MS, range[1] + SLIDE_MS] : range;
  const cells = prefix ? [<Text key="prefix" style={[style, GLYPH_ROOM]}>{prefix}</Text>] : [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const oldCh = a[i] ?? '';
    const newCh = b[i] ?? '';
    if (oldCh === newCh) cells.push(<Text key={i} style={[style, GLYPH_ROOM]}>{oldCh}</Text>);
    else if ((gains && oldCh === '') || (loses && newCh === '')) {
      cells.push(<SlidingCell key={i} oldCh={oldCh} newCh={newCh} ms={ms} slide={slide} roll={roll} style={style} lh={lh} />);
    } else cells.push(<RollChar key={i} oldCh={oldCh} newCh={newCh} ms={ms} range={roll} style={style} lh={lh} />);
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center', height: lh }}>{cells}</View>;
}
