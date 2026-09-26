import { memo } from 'react';
import { View, Text } from 'react-native';
import { dim } from './savingsShared';
import { textColor } from '../utils/colors';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const DOT = 13;
const COL = 19;
const LABEL_W = 30;
const FILLED = '#4ade80';

function Dot({ paid, inRange, light }) {
  if (!inRange) {
    return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: dim(light, 0.05) }} />;
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
          <Text key={i} style={{ width: COL, textAlign: 'center', fontSize: 11, color: textColor(light).disabled }}>{letter}</Text>
        ))}
      </View>
      {years.map(({ year, cells }) => (
        <View key={year} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ width: LABEL_W, fontSize: 12, color: textColor(light).tertiary }}>{year}</Text>
          {cells.map((cell, i) => (
            <View key={i} style={{ width: COL, alignItems: 'center' }}>
              <Dot paid={cell.paid} inRange={cell.inRange} light={light} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default memo(PaymentGrid);
