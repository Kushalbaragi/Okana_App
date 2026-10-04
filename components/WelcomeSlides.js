import { View, Text, useWindowDimensions } from 'react-native';
import PaymentGrid from './PaymentGrid';
import { Card, ProgressBar } from './savingsShared';
import { CheckIcon } from './icons';
import { darkText, EXPENSE, INCOME_HEX } from '../utils/colors';
import { GUTTER } from '../utils/spacing';
import { FONT, TABULAR } from '../utils/type';
import { PRICE_PER_YEAR } from '../utils/trial';

// The first-run slides, one component each. Every one is given `top` (where its
// title sits — the same on every slide that has one) and `bottom` (the footer's
// height, kept clear); whatever is between the two takes the space that is left.
// Amounts and names are made-up examples.

const HAIRLINE = 'rgba(255,255,255,0.08)';
const DIM_RED = 'rgba(255,75,75,0.4)';
// Every progress bar on these slides is the savings card's: its width (the card
// minus this inset each side) and its height.
const BAR_INSET = 18;
const BAR_HEIGHT = 8;
const LABEL = { fontSize: FONT.label, letterSpacing: 0.8, textTransform: 'uppercase', color: darkText.disabled, paddingHorizontal: 6 };

// One title style for every slide, the first one's included.
const TITLE = { fontSize: FONT.title, fontWeight: '600', color: '#ffffff', textAlign: 'center' };
// More room at the sides than the app's own gutter, so what is drawn on a slide
// (chart, cards, lists) stays a little smaller than it would on a screen.
const CONTENT_PAD = 32;

function Slide({ top, bottom, title, children }) {
  return (
    <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: CONTENT_PAD }}>
      <Text style={TITLE}>{title}</Text>
      {children}
    </View>
  );
}

function Caption({ children }) {
  return <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, textAlign: 'center', lineHeight: 19, marginTop: 10 }}>{children}</Text>;
}

// The middle of the whole screen, not of what is left above the footer.
function Centered({ children }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER }}>{children}</View>;
}

export function WelcomeSlide() {
  return (
    <Centered>
      {/* "Welcome to" steps back so the name is what is read. */}
      <Text style={TITLE}>
        <Text style={{ opacity: 0.6 }}>Welcome to </Text>Okana
      </Text>
    </Centered>
  );
}

const BARS = [38, 52, 44, 70, 58, 64, 48, 80, 60, 72];
const MONTHS = 'JFMAMJJASO'.split('');

export function ExpensesSlide({ top, bottom }) {
  const { height } = useWindowDimensions();
  const chartHeight = Math.max(110, Math.min(190, Math.round(height * 0.22)));
  return (
    <Slide top={top} bottom={bottom} title="See where it goes">
      <Caption>{'No category, no friction.\nJust add and watch.'}</Caption>
      <View style={{ marginTop: 40, paddingHorizontal: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: chartHeight }}>
          {BARS.map((h, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: `${h}%`,
                borderTopLeftRadius: 5, borderTopRightRadius: 5,
                backgroundColor: i === BARS.length - 1 ? EXPENSE : DIM_RED,
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 8 }}>
          {MONTHS.map((m, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: FONT.label, color: darkText.tertiary }}>{m}</Text>
          ))}
        </View>
      </View>
      <View style={{ marginTop: 24, paddingHorizontal: 6 }}>
        {[['Groceries', '−₹640'], ['Coffee', '−₹120'], ['Auto', '−₹90'], ['Lunch', '−₹260']].map(([name, amount]) => (
          <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 }}>
            <Text style={{ fontSize: FONT.caption, color: 'rgba(255,255,255,0.8)' }}>{name}</Text>
            <Text style={{ fontSize: FONT.caption, fontWeight: '300', color: EXPENSE, ...TABULAR }}>{amount}</Text>
          </View>
        ))}
      </View>
    </Slide>
  );
}

function PlanRow({ name, amount, checked }) {
  const muted = 'rgba(255,255,255,0.4)';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
      {checked ? (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: INCOME_HEX, alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon size={16} color="#000000" />
        </View>
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' }} />
      )}
      <Text style={{ flex: 1, fontSize: FONT.caption, color: checked ? muted : 'rgba(255,255,255,0.85)' }}>{name}</Text>
      <Text style={{ fontSize: FONT.caption, fontWeight: '300', color: checked ? muted : '#ffffff', ...TABULAR }}>{amount}</Text>
    </View>
  );
}

export function BudgetSlide({ top, bottom }) {
  return (
    <Slide top={top} bottom={bottom} title="Plan the month">
      <Caption>A budget and a list of what is coming.</Caption>
      <View style={{ marginTop: 40, paddingHorizontal: BAR_INSET }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}>Budget · September</Text>
          <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}>62%</Text>
        </View>
        <ProgressBar percent={62} height={BAR_HEIGHT} trackColor="rgba(74,222,128,0.12)" />
      </View>
      <Text style={{ ...LABEL, marginTop: 28, marginBottom: 8 }}>Plan your next entry</Text>
      <Card>
        <View style={{ paddingHorizontal: BAR_INSET, paddingVertical: 4 }}>
          <PlanRow name="Rent" amount="₹12,000" checked />
          <PlanRow name="Internet" amount="₹800" />
          <PlanRow name="Groceries" amount="₹6,000" />
        </View>
      </Card>
    </Slide>
  );
}

const HISTORY = [
  ['Added', 'Sep 28', '+₹5,000'],
  ['Added', 'Sep 14', '+₹3,000'],
  ['Withdrew', 'Sep 3', '−₹2,000'],
  ['Added', 'Aug 27', '+₹6,000'],
];

export function SavingsSlide({ top, bottom }) {
  return (
    <Slide top={top} bottom={bottom} title="Save for what matters">
      <Text style={{ fontSize: FONT.title, fontWeight: '500', color: '#ffffff', textAlign: 'center', marginTop: 28, marginBottom: 14 }}>Emergency fund</Text>
      <Card>
        <View style={{ padding: BAR_INSET }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontSize: FONT.amount, fontWeight: '500', color: '#ffffff', ...TABULAR }}>₹58,000</Text>
              <Text style={{ fontSize: FONT.caption, color: darkText.secondary }}>left of ₹1,00,000</Text>
            </View>
            <Text style={{ fontSize: FONT.caption, color: darkText.secondary }}>42% saved</Text>
          </View>
          <ProgressBar percent={42} height={BAR_HEIGHT} trackColor="rgba(74,222,128,0.12)" />
        </View>
      </Card>
      <View style={{ height: 12 }} />
      <Card>
        {HISTORY.map(([what, date, amount], i) => (
          <View
            key={date}
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingVertical: 12, paddingHorizontal: 18,
              borderTopWidth: i ? 1 : 0, borderTopColor: HAIRLINE,
            }}
          >
            <View>
              <Text style={{ fontSize: FONT.caption, color: 'rgba(255,255,255,0.85)' }}>{what}</Text>
              <Text style={{ fontSize: FONT.label, color: darkText.tertiary, marginTop: 2 }}>{date}</Text>
            </View>
            <Text style={{ fontSize: FONT.caption, fontWeight: '300', color: what === 'Added' ? 'rgba(74,222,128,0.85)' : '#ffffff', ...TABULAR }}>{amount}</Text>
          </View>
        ))}
      </Card>
    </Slide>
  );
}

// A 24-EMI loan, 8 paid: this year's twelve months, then next year's.
const YEARS = [
  { year: 2026, cells: Array.from({ length: 12 }, (_, i) => ({ paid: i < 8, inRange: true })) },
  { year: 2027, cells: Array.from({ length: 12 }, () => ({ paid: false, inRange: true })) },
];

export function DebtSlide({ top, bottom }) {
  return (
    <Slide top={top} bottom={bottom} title="Pay off, one EMI at a time">
      <Text style={{ fontSize: FONT.body, fontWeight: '500', color: darkText.secondary, textAlign: 'center', marginTop: 24 }}>Bike loan</Text>
      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 20 }}>
        <Text style={{ fontSize: FONT.display, fontWeight: '400', letterSpacing: -1.5, color: '#ffffff', ...TABULAR }}>₹38,400</Text>
        <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 6 }}>left to pay</Text>
      </View>
      <Text style={{ ...LABEL, marginBottom: 8 }}>EMI tracker</Text>
      <Card>
        <View style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
          <Text style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: FONT.amount, fontWeight: '600', letterSpacing: -0.5, color: 'rgba(255,255,255,0.9)' }}>16</Text>
            <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}> EMI remaining</Text>
          </Text>
          <PaymentGrid years={YEARS} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: HAIRLINE }}>
            <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}>Total loan <Text style={{ color: darkText.secondary }}>₹57,600</Text></Text>
            <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}><Text style={{ color: darkText.secondary }}>₹2,400</Text> / month</Text>
          </View>
        </View>
      </Card>
    </Slide>
  );
}

// In the middle of the screen, sitting 15px above its true centre. The extra
// bottom padding (14px more than the 30 that does that) is what keeps "okana"
// where it was after the line under it moved 14px closer.
export function StartSlide() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 44, paddingHorizontal: GUTTER }}>
      <Text style={{ fontSize: FONT.display, fontWeight: '400', letterSpacing: -1.5, color: '#ffffff' }}>okana</Text>
      <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 4 }}>{`30 days free, then ₹${PRICE_PER_YEAR} a year`}</Text>
    </View>
  );
}

// In the order they are shown. The first and last have no title to line up, so
// they sit in the middle of the screen instead of starting at `top`.
export const WELCOME_SLIDES = [
  { key: 'welcome', Component: WelcomeSlide },
  { key: 'expenses', Component: ExpensesSlide },
  { key: 'budget', Component: BudgetSlide },
  { key: 'savings', Component: SavingsSlide },
  { key: 'debt', Component: DebtSlide },
  { key: 'start', Component: StartSlide },
];
