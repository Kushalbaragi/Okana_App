import { memo } from 'react';
import { View, Text } from 'react-native';
import { dim } from './savingsShared';
import { textColor } from '../utils/colors';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Bigger than before, now that the month columns flex to fill the card's
// own width (see below) instead of sitting at a fixed size — the dots
// stretching only made the leftover space more obvious, so they're sized to
// actually use it rather than floating in a wider column around the same
// small circle.
const DOT = 17;
const LABEL_W = 38;
const FILLED = '#4ade80';

function Dot({ paid, inRange, light }) {
  // Months before the loan started tracking, or past its tenure — barely
  // there at all, just enough to keep the grid's own shape (every year a
  // full 12 columns) without drawing the eye to a month that was never
  // actually part of the loan.
  if (!inRange) {
    return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: dim(light, 0.02) }} />;
  }
  if (paid) {
    return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: FILLED }} />;
  }
  return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5, borderColor: dim(light, 0.18) }} />;
}

// A year-by-month grid of paid/unpaid EMIs, read like a habit tracker rather
// than a chart — a loan's monthly payment barely moves month to month, so a
// net-amount line (see MonthSlider, Savings' own equivalent) has nothing
// useful to say; whether that month's EMI landed is the thing worth seeing.
// A filled dot is a month with a logged payment, an outlined dot is a month
// still due, and a near-invisible dot is outside the loan's own tracked span
// (before it was added, or past its tenure).
function PaymentGrid({ years, light }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={{ width: LABEL_W }} />
        {MONTH_LETTERS.map((letter, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: textColor(light).disabled }}>{letter}</Text>
        ))}
      </View>
      {years.map(({ year, cells }) => (
        <View key={year} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          {/* paddingRight, not a wider LABEL_W alone — keeps the year clear
              of the first dot's column without shifting every month column
              after it out of line with its own header letter above. */}
          <Text style={{ width: LABEL_W, paddingRight: 8, fontSize: 12, color: textColor(light).tertiary }}>{year}</Text>
          {cells.map((cell, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Dot paid={cell.paid} inRange={cell.inRange} light={light} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default memo(PaymentGrid);
