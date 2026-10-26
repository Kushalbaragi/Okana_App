import { View, Text, useWindowDimensions } from 'react-native';
import { Card, ProgressBar } from './savingsShared';
import { darkText, EXPENSE, INCOME_HEX } from '../utils/colors';
import { formatCurrency } from '../utils/format';
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

function WelcomeSlide() {
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

function ExpensesSlide({ top, bottom }) {
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

// What the daily insights cover, as three made-up examples: what went wrong, what to
// improve and what went well.
const INSIGHT_CARDS = [
  { label: 'Went wrong', color: EXPENSE, text: 'One purchase took 40% of your month' },
  { label: 'Improve', color: '#fbbf24', text: 'Wait 28 days before big buys' },
  { label: 'Went well', color: INCOME_HEX, text: 'Everything else stayed in line' },
];

function InsightsSlide({ top, bottom }) {
  return (
    <Slide top={top} bottom={bottom} title="Get custom insights">
      <Caption>{'We study your spending, and tell you\nwhat went wrong and what to improve.'}</Caption>
      <View style={{ marginTop: 40, gap: 10 }}>
        {INSIGHT_CARDS.map(({ label, color, text }) => (
          <View key={label} style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16 }}>
            <Text style={{ ...LABEL, paddingHorizontal: 0, color }}>{label}</Text>
            <Text style={{ fontSize: FONT.body, lineHeight: 22, color: 'rgba(255,255,255,0.9)', marginTop: 6 }}>{text}</Text>
          </View>
        ))}
      </View>
    </Slide>
  );
}

const HISTORY = [
  ['Added', 'Sep 28', '+₹5,000'],
  ['Added', 'Sep 14', '+₹3,000'],
  ['Withdrew', 'Sep 3', '−₹2,000'],
  ['Added', 'Aug 27', '+₹6,000'],
];

function SavingsSlide({ top, bottom }) {
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

// The Debt page's main view, made up: what is left to pay in all, and each loan with what
// is still owed and how much is paid.
const LOANS = [
  { name: 'Home loan', left: 1240000, percent: 30 },
  { name: 'Car loan', left: 310000, percent: 45 },
  { name: 'Bike loan', left: 38400, percent: 33 },
  { name: 'Phone EMI', left: 14000, percent: 60 },
];
const TOTAL_LEFT = LOANS.reduce((sum, l) => sum + l.left, 0);
// The total under the title, a step below the real page's headline figure so the list fits.
const HERO_SIZE = 32;

function DebtSlide({ top, bottom }) {
  return (
    <Slide top={top} bottom={bottom} title="All your EMI in one place">
      <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: HERO_SIZE, fontWeight: '400', letterSpacing: -1, color: '#ffffff', ...TABULAR }}>{formatCurrency(TOTAL_LEFT)}</Text>
        <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 6 }}>left to pay</Text>
      </View>
      <Text style={{ ...LABEL, marginBottom: 8 }}>Loans · {LOANS.length}</Text>
      <Card>
        {LOANS.map(({ name, left, percent }, i) => (
          <View
            key={name}
            style={{ paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: i ? 1 : 0, borderTopColor: HAIRLINE }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
              <Text style={{ fontSize: FONT.caption, color: 'rgba(255,255,255,0.9)' }}>{name}</Text>
              <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, ...TABULAR }}>{formatCurrency(left)} left</Text>
            </View>
            <ProgressBar percent={percent} height={6} trackColor="rgba(74,222,128,0.12)" />
          </View>
        ))}
      </Card>
    </Slide>
  );
}

// In the middle of the screen, sitting 15px above its true centre. The extra
// bottom padding (14px more than the 30 that does that) is what keeps "okana"
// where it was after the line under it moved 14px closer.
function StartSlide() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 44, paddingHorizontal: GUTTER }}>
      <Text style={{ fontSize: FONT.display, fontWeight: '400', letterSpacing: -1.5, color: '#ffffff' }}>okana</Text>
      <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 4 }}>{`7 days free, then ₹${PRICE_PER_YEAR} a year`}</Text>
    </View>
  );
}

// In the order they are shown. The first and last have no title to line up, so they sit
// in the middle of the screen instead of starting at `top`.
export const WELCOME_SLIDES = [
  { key: 'welcome', Component: WelcomeSlide },
  { key: 'expenses', Component: ExpensesSlide },
  { key: 'insights', Component: InsightsSlide },
  { key: 'savings', Component: SavingsSlide },
  { key: 'debt', Component: DebtSlide },
  { key: 'start', Component: StartSlide },
];
