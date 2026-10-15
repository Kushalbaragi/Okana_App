import { View, Text } from 'react-native';
import { dateBoxParts } from '../utils/format';
import { textColor } from '../utils/colors';
import { TABULAR } from '../utils/type';

// The day over the month's three letters, in a small pill: the transaction rows' and
// the savings history's date. `style` is extra layout from the row it sits in.
export default function DatePill({ dateStr, light, style }) {
  const { day, month } = dateBoxParts(dateStr);
  return (
    <View style={[{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)' }, style]}>
      {/* Both lines are shrink-wrapped to their own text and centred by this
          column, so each sits on the pill's middle line whatever its width. */}
      <View style={{ alignItems: 'center' }}>
        <Text style={[TABULAR, { includeFontPadding: false, fontSize: 11, lineHeight: 12, fontWeight: '500', color: textColor(light).tertiary }]}>{String(day).padStart(2, '0')}</Text>
        {/* letterSpacing also trails the last letter, which pulls the word left of
            centre; the matching left padding puts it back. */}
        <View style={{ paddingLeft: 0.5, marginTop: 1 }}>
          <Text style={{ includeFontPadding: false, fontSize: 7, lineHeight: 8, fontWeight: '500', letterSpacing: 0.5, color: textColor(light).tertiary }}>{month}</Text>
        </View>
      </View>
    </View>
  );
}
