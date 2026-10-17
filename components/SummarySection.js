import { memo, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import ShimmerQuote from './ShimmerQuote';
import { useAuth } from '../context/AuthContext';
import { useInsight } from '../hooks/useInsight';
import { ChevronRight } from './icons';
import { MONTH_NAMES, hasAnyRecapData, prevMonthYear } from '../utils/monthlyRecap';
import { textColor } from '../utils/colors';
import { FONT } from '../utils/type';

// The wallet page's first section, ahead of Savings and Debt. Plain, quiet and static:
// today's date, then the day's observation about the user's own money as a title, a
// line of detail under it, and a short saying that fits it. Nothing is revealed or
// moves except a light that keeps passing over the saying. What it says comes from
// utils/insightEngine.js.
//
// Mounted only once the section has been opened (see WalletPage): picking today's
// insight marks it as shown, which must not happen for a page nobody has looked at.

// "14 OCT 2026"
function todayLabel() {
  const d = new Date();
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()} ${d.getFullYear()}`;
}

// Shown when the engine has nothing true and meaningful to say yet, which is what a
// new account sees. Warm, and says what would change it.
const NOTHING_YET = 'Keep adding your spending. Your insights will show up here.';

// The accent of the monthly summary entry: a colour of its own, so it reads as something
// to open rather than as money (red and green are kept for that).
const SUMMARY_DOT = '#a78bfa';

// Both pills at the top of the page share one look; only their position differs.
const pillStyle = (light, top) => ({
  position: 'absolute', top, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
  backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
});

function SummarySection({ userId, transactions, budgetAmount, savings, light = false, onOpenSummary, onSetBudget }) {
  const t = textColor(light);
  // Only a name the user actually set: the account falls back to the start of their email
  // otherwise, which isn't something to call them by.
  const { user } = useAuth();
  const name = user?.user_metadata?.name || '';
  const { allGoals, allDebts } = savings;

  // Goals and loans together: the engine tells them apart by `kind`.
  const goals = useMemo(() => [...allGoals, ...allDebts], [allGoals, allDebts]);
  const { ready, insight, description, quote } = useInsight({ userId, name, transactions, budgetAmount, goals });

  const title = insight ? insight.text : NOTHING_YET;

  // Last month's summary, offered at the top of the page once there is a last month to sum up.
  const summaryMonth = useMemo(() => {
    const now = new Date();
    const prev = prevMonthYear(now.getMonth(), now.getFullYear());
    return hasAnyRecapData(transactions, prev.month, prev.year) ? `${MONTH_NAMES[prev.month]} ${prev.year}` : null;
  }, [transactions]);

  // The budget pill takes the top spot, or goes just under the summary pill when that is showing.
  const showSummaryPill = !!summaryMonth && !!onOpenSummary;

  return (
    // One group, centred between the tab switch and the bottom of the screen. Static:
    // the page never scrolls.
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 72 }}>
      {showSummaryPill && (
        <Pressable
          onPress={onOpenSummary}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open your ${summaryMonth} summary`}
          style={pillStyle(light, 16)}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: SUMMARY_DOT }} />
          <Text style={{ fontSize: FONT.caption, color: t.secondary }}>{summaryMonth} summary</Text>
          <ChevronRight color={t.disabled} />
        </Pressable>
      )}
      {!!onSetBudget && (
        <Pressable
          onPress={onSetBudget}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Set this month's budget"
          style={pillStyle(light, showSummaryPill ? 60 : 16)}
        >
          <Text style={{ fontSize: FONT.caption, color: t.secondary }}>Set this month's budget</Text>
          <ChevronRight color={t.disabled} />
        </Pressable>
      )}
      {ready && (
        <View>
          <Text style={{ fontSize: FONT.caption, letterSpacing: 0.5, color: t.tertiary, marginBottom: 18 }}>{todayLabel()}</Text>

          <Text style={{ fontSize: FONT.body, lineHeight: 22, fontWeight: '600', color: t.primary }}>{title}</Text>

          {description && (
            <Text style={{ fontSize: FONT.body, lineHeight: 22, color: t.secondary, marginTop: 18 }}>{description}</Text>
          )}

          {quote && (
            <View style={{ marginTop: 44 }}>
              <ShimmerQuote text={`\u201C${quote}\u201D`} color={t.primary} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default memo(SummarySection);
