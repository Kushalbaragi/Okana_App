import { memo, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import ShimmerQuote from './ShimmerQuote';
import { CoinStack, CoinCompare, Receipt, BudgetCoins, PiggyBank, EmiTicks, LoanBars, PriceTag, BalanceScale, PartyPopper, Fireworks, MonthTicks, OpenSafe, WiltingPlant, FinishArch, TaxiMeter, TreasureChest, PlannerPage, Ledger, MonthsCover, FamilyShield, Clipboard, GrowStacks, CartPause, LaptopNight, Sunset, Untangle, Stairs, CardCut, NeedIt, Packs, CreepSplit, Rule72, WorryPeace, RainUmbrella } from './InsightVisual';
import { useAuth } from '../context/AuthContext';
import { useInsight } from '../hooks/useInsight';
import { ChevronRight } from './icons';
import { MONTH_NAMES, hasAnyRecapData, prevMonthYear } from '../utils/monthlyRecap';
import { textColor } from '../utils/colors';
import { FONT, TABULAR } from '../utils/type';

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
// A coin insight's headline figure: the red of its red coins when the news is bad
// (more spent, more owed), the green of its green coins when it is good, and the
// plain text colour for a 'neutral' nudge.
const COIN_BAD = '#f87171';
const COIN_GOOD = '#4ade80';
// Insight pictures drawn beside the text, with their own headline and caption in place of a title.
const SIDE_VISUALS = ['coins', 'coinCompare', 'receipt', 'budgetCoins', 'piggy', 'emiTicks', 'loanBars', 'priceTag', 'scale', 'popper', 'fireworks', 'monthTicks', 'safe', 'wilt', 'arch', 'meter', 'chest', 'planner', 'incomeCompare', 'ledger', 'monthsCover', 'familyShield', 'clipboard', 'growStacks', 'cartPause', 'laptopNight', 'sunset', 'untangle', 'stairs', 'cardCut', 'needIt', 'packs', 'creepSplit', 'rule72', 'worryPeace', 'rainUmbrella'];
// Of those, the ones whose text is centred against the picture rather than bottom-aligned.
const CENTRED_TEXT = ['receipt', 'emiTicks', 'loanBars', 'priceTag', 'scale', 'popper', 'fireworks', 'monthTicks', 'safe', 'wilt', 'arch', 'meter', 'chest', 'planner', 'incomeCompare', 'ledger', 'monthsCover', 'familyShield', 'clipboard', 'growStacks', 'cartPause', 'laptopNight', 'sunset', 'untangle', 'stairs', 'cardCut', 'needIt', 'packs', 'creepSplit', 'rule72', 'worryPeace', 'rainUmbrella'];

// Both pills at the top of the page share one look; only their position differs.
const pillStyle = (light, top) => ({
  position: 'absolute', top, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
  backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
});

// The picture for an insight or learn card drawn beside (or, for a learn card, above)
// its text, by the visual's type.
function renderPicture(visual, light) {
  switch (visual.type) {
    case 'coins': return <CoinStack percent={visual.percent} />;
    case 'coinCompare': return <CoinCompare prev={visual.prev} cur={visual.cur} prevLabel={visual.prevLabel} curLabel={visual.curLabel} light={light} />;
    case 'incomeCompare': return <CoinCompare prev={visual.prev} cur={visual.cur} prevLabel={visual.prevLabel} curLabel={visual.curLabel} prevAmount={visual.prevAmount} curAmount={visual.curAmount} allGreen light={light} />;
    case 'receipt': return <Receipt heading={visual.heading} rows={visual.rows} light={light} />;
    case 'budgetCoins': return <BudgetCoins used={visual.used} />;
    case 'piggy': return <PiggyBank percent={visual.percent} coin={visual.coin} label={visual.label} light={light} />;
    case 'emiTicks': return <EmiTicks paid={visual.paid} total={visual.total} />;
    case 'loanBars': return <LoanBars rows={visual.rows} light={light} />;
    case 'priceTag': return <PriceTag was={visual.was} now={visual.now} good={visual.good} label={visual.label} light={light} />;
    case 'popper': return <PartyPopper />;
    case 'fireworks': return <Fireworks />;
    case 'monthTicks': return <MonthTicks months={visual.months} light={light} />;
    case 'safe': return <OpenSafe />;
    case 'wilt': return <WiltingPlant label={visual.label} light={light} />;
    case 'arch': return <FinishArch label={visual.label} light={light} />;
    case 'meter': return <TaxiMeter reading={visual.reading} light={light} />;
    case 'chest': return <TreasureChest />;
    case 'ledger': return <Ledger light={light} />;
    case 'monthsCover': return <MonthsCover months={visual.months} label={visual.label} light={light} />;
    case 'familyShield': return <FamilyShield label={visual.label} light={light} />;
    case 'clipboard': return <Clipboard label={visual.label} light={light} />;
    case 'cartPause': return <CartPause label={visual.label} light={light} />;
    case 'laptopNight': return <LaptopNight label={visual.label} light={light} />;
    case 'sunset': return <Sunset label={visual.label} light={light} />;
    case 'untangle': return <Untangle label={visual.label} light={light} />;
    case 'stairs': return <Stairs label={visual.label} light={light} />;
    case 'cardCut': return <CardCut label={visual.label} light={light} />;
    case 'needIt': return <NeedIt label={visual.label} light={light} />;
    case 'packs': return <Packs packs={visual.packs} label={visual.label} light={light} />;
    case 'rule72': return <Rule72 light={light} />;
    case 'worryPeace': return <WorryPeace light={light} />;
    case 'rainUmbrella': return <RainUmbrella leftLabel={visual.leftLabel} rightLabel={visual.rightLabel} light={light} />;
    case 'creepSplit': return <CreepSplit leftLabel={visual.leftLabel} rightLabel={visual.rightLabel} light={light} />;
    case 'growStacks': return <GrowStacks put={visual.put} final={visual.final} putLabel={visual.putLabel} finalLabel={visual.finalLabel} label={visual.label} captions={visual.captions} greenFirst={visual.greenFirst} light={light} />;
    case 'planner': return <PlannerPage heading={visual.heading} hint={visual.hint} light={light} />;
    case 'scale': return <BalanceScale change={visual.change} prevLabel={visual.prevLabel} curLabel={visual.curLabel} light={light} />;
    default: return null;
  }
}

function SummarySection({ userId, transactions, budgetAmount, savings, light = false, onOpenSummary, onSetBudget, onSetGoal }) {
  const t = textColor(light);
  // Only a name the user actually set: the account falls back to the start of their email
  // otherwise, which isn't something to call them by.
  const { user } = useAuth();
  const name = user?.user_metadata?.name || '';
  const { allGoals, allDebts } = savings;

  // Goals and loans together: the engine tells them apart by `kind`.
  const goals = useMemo(() => [...allGoals, ...allDebts], [allGoals, allDebts]);
  const { ready, insight, description, quote, visual, facts } = useInsight({ userId, name, transactions, budgetAmount, goals });

  const title = insight ? insight.text : NOTHING_YET;
  // The goal a card's button creates, if it names one: its name, and its months of the
  // user's own monthly spending, to the nearest ₹1,000, as the target (none if unknown).
  const goalToCreate = useMemo(() => {
    const g = visual?.goal;
    if (!g) return null;
    const spend = facts?.monthlySpend > 0 ? Math.round((facts.monthlySpend * g.months) / 1000) * 1000 : 0;
    return { name: g.name, target: spend };
  }, [visual, facts]);
  // These pictures go beside the text, not under it.
  const sideVisual = SIDE_VISUALS.includes(visual?.type);
  // A learn card's picture has no figure beside it, so it goes above its text instead.
  const learnCard = sideVisual && !visual.headline;

  // Last month's summary, offered at the top of the page once there is a last month to sum up.
  const summaryMonth = useMemo(() => {
    const now = new Date();
    const prev = prevMonthYear(now.getMonth(), now.getFullYear());
    return hasAnyRecapData(transactions, prev.month, prev.year) ? `${MONTH_NAMES[prev.month]} ${prev.year}` : null;
  }, [transactions]);

  // The budget pill takes the top spot, or goes just under the summary pill when that is showing.
  const showSummaryPill = !!summaryMonth && !!onOpenSummary;
  // The budget pill steps aside when today's insight carries its own "Set budget" button.
  const showBudgetPill = !!onSetBudget && !visual?.cta;

  return (
    // One group, sitting a third of the way down the space between the tab switch and
    // the bottom of the screen (the free space splits 1 : 2 above and below it), which
    // reads as the middle to the eye. Static: the page never scrolls.
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 72 }}>
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
      {showBudgetPill && (
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
      <View style={{ flex: 1 }} />
      {ready && (
        <View>
          {/* More room under the date when the coins come next: there is no title between. */}
          <Text style={{ fontSize: FONT.caption, letterSpacing: 0.5, color: t.tertiary, marginBottom: sideVisual ? 44 : 18 }}>{todayLabel()}</Text>

          {learnCard ? (
            // A learn card: its picture centred on top, then the title and a longer
            // description below at full width, left-aligned so it reads easily.
            <View>
              <View style={{ alignItems: 'center' }}>{renderPicture(visual, light)}</View>
              <Text style={{ fontSize: FONT.body, lineHeight: 22, fontWeight: '600', color: t.primary, marginTop: 26 }}>{title}</Text>
              {description && (
                <Text style={{ fontSize: 14, lineHeight: 21, color: t.secondary, marginTop: 10 }}>{description}</Text>
              )}
              {/* Things to check, each ticked with a line of why, when the lesson has them. */}
              {!!visual.checks && (
                <View style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: '#111113' }}>
                  {visual.checks.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: '#1f1f22' }}>
                      {/* A tick, the step's number for a list meant to be done in order, or
                          nothing for a plain list. */}
                      {!visual.plain && <Text style={{ fontSize: FONT.caption, color: COIN_GOOD, fontWeight: visual.numbered ? '700' : '400', width: visual.numbered ? 12 : undefined }}>{visual.numbered ? i + 1 : '✓'}</Text>}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: FONT.caption, color: t.primary }}>{r.label}</Text>
                        {!!r.detail && <Text style={{ fontSize: 12, lineHeight: 17, color: t.tertiary, marginTop: 2 }}>{r.detail}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {/* A worked example, once, then a flat two-column table under it. */}
              {!!visual.example && (
                <Text style={{ fontSize: FONT.body, textAlign: 'center', color: t.primary, marginTop: 16, ...TABULAR }}>
                  {visual.example.text} <Text style={{ fontWeight: '600', color: COIN_GOOD }}>{visual.example.result}</Text>
                </Text>
              )}
              {!!visual.table && (
                <View style={{ marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: '#111113' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <Text style={{ fontSize: FONT.caption, color: t.tertiary }}>{visual.table.head[0]}</Text>
                    <Text style={{ fontSize: FONT.caption, color: t.tertiary }}>{visual.table.head[1]}</Text>
                  </View>
                  {visual.table.rows.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderColor: '#1f1f22' }}>
                      <Text style={{ fontSize: FONT.caption, color: r.tone === 'good' ? COIN_GOOD : t.secondary, fontWeight: r.tone === 'good' ? '600' : '400' }}>{r.label}</Text>
                      <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: r.tone === 'good' ? COIN_GOOD : t.primary, ...TABULAR }}>{r.value}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* The numbers behind the lesson, as a small sum, when it has them. */}
              {!!visual.sum && (
                <View style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: '#111113' }}>
                  {visual.sum.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderTopWidth: r.rule ? 1 : 0, borderColor: '#2c2c2e' }}>
                      {/* The label sits in its own box that can shrink and wrap on the left;
                          the value is a fixed-width box on the right, so a long label can
                          never push it out of the table. */}
                      <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: FONT.caption, color: t.tertiary }}>{r.label}</Text>
                      </View>
                      <View style={{ flexGrow: 0, flexShrink: 0, marginLeft: 12 }}>
                        <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: r.tone === 'good' ? COIN_GOOD : r.tone === 'bad' ? COIN_BAD : r.strong ? t.primary : t.secondary, ...TABULAR }}>{r.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {/* A lesson that ends in an action gets a button for it ("Set a saving goal"). */}
              {!!visual.cta && !!onSetGoal && (
                <Pressable onPress={() => onSetGoal(goalToCreate)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'center', marginTop: 18, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 999, backgroundColor: 'rgba(74,222,128,0.25)' }}>
                  <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: COIN_GOOD }}>{visual.cta}</Text>
                </Pressable>
              )}
              {/* A last, quieter line at the very bottom: a caveat, or who the lesson
                  doesn't apply to. */}
              {!!visual.note && (
                <Text style={{ fontSize: 12, lineHeight: 18, color: t.disabled, marginTop: 14 }}>{visual.note}</Text>
              )}
            </View>
          ) : sideVisual ? (
            // The coins sit beside the text, and the headline figure and caption say
            // what the title would have, so there is no title above.
            // Bottom-aligned, so the coins end where the description does.
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 20 }}>
              {renderPicture(visual, light)}
              {/* Beside most pictures the text sits in the middle; beside coins it ends with them. */}
              <View style={{ flex: 1, alignSelf: CENTRED_TEXT.includes(visual.type) ? 'center' : 'auto' }}>
                <Text style={{ fontSize: FONT.amount + 4, fontWeight: '600', letterSpacing: -0.6, color: visual.tone === 'good' ? COIN_GOOD : visual.tone === 'bad' ? COIN_BAD : t.primary }}>{visual.headline}</Text>
                <Text style={{ fontSize: FONT.body, lineHeight: 22, color: t.primary, marginTop: 2 }}>{visual.caption}</Text>
                {description && (
                  <Text style={{ fontSize: FONT.body, lineHeight: 22, color: t.secondary, marginTop: 10 }}>{description}</Text>
                )}
                {/* An insight that asks for something gets a button to do it (set_budget). */}
                {!!visual.cta && !!onSetBudget && (
                  <Pressable onPress={onSetBudget} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 14, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(74,222,128,0.25)' }}>
                    <Text style={{ fontSize: FONT.caption, fontWeight: '600', color: COIN_GOOD }}>{visual.cta}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: FONT.body, lineHeight: 22, fontWeight: '600', color: t.primary }}>{title}</Text>

              {description && (
                <Text style={{ fontSize: FONT.body, lineHeight: 22, color: t.secondary, marginTop: 18 }}>{description}</Text>
              )}
            </>
          )}

          {quote && (
            <View style={{ marginTop: 44 }}>
              <ShimmerQuote text={`\u201C${quote}\u201D`} color={t.primary} />
            </View>
          )}
        </View>
      )}
      <View style={{ flex: 2 }} />
    </View>
  );
}

export default memo(SummarySection);
