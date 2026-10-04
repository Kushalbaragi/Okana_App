import { useCallback, useEffect, useRef, useState } from 'react';
import { currentMonthYear, today } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { reportError } from '../utils/errors';

// Quarter-way lines for an EMI loan, shown inside the paid moment.
const MILESTONE_TITLES = ['A quarter of the way', 'Halfway there', 'Almost there'];

// Never leave the slider held or the page frozen if the paid moment doesn't play.
const FAILSAFE_MS = 30000;
// The payment's row joins the history once the paid moment's dark wash is in.
const ROW_REVEAL_MS = 800;
// After the moment: the status figure updates, then — this long after — the
// tracker's circle fills, and the page is live again this long after that.
const BAR_TO_DOTS_MS = 1100;
const DOTS_SETTLE_MS = 1500;
// How long the "which rows are new" marker lingers once the page is live.
const NEW_ROW_MARK_MS = 3000;

// The slide-to-pay flow for an EMI loan, as one sequence of page states:
//
//   frozen — the slide landed; the page keeps showing the pre-payment figures
//            (`frozen`) and hides the payment it just logged while the paid
//            moment plays
//   bar    — the moment is over; the status figure shows its new value
//   dots   — the tracker shows its new value (the circle fills)
//   null   — live
//
// `barG`/`dotG` are what the status figure and the tracker should read from
// (the frozen snapshot or the live goal); `shownEntries` is the history with the
// not-yet-revealed payment left out. `payEmi` resolves to whether the payment
// was saved, so the slider can spring back if it wasn't.
export default function useEmiPayFlow({ goal, savings, emiConfirm }) {
  const [moment, setMoment] = useState(null);
  const [payHold, setPayHold] = useState(false);
  const [phase, setPhase] = useState(null);
  const [frozen, setFrozen] = useState(null);
  const [baseIds, setBaseIds] = useState(null);
  const confirmArgsRef = useRef(null);
  const failsafeRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const revealRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(failsafeRef.current);
    clearTimeout(phaseTimerRef.current);
    clearTimeout(revealRef.current);
  }, []);

  // Once the page is live again, forget which rows were new.
  useEffect(() => {
    if (phase !== null || !baseIds) return undefined;
    const id = setTimeout(() => setBaseIds(null), NEW_ROW_MARK_MS);
    return () => clearTimeout(id);
  }, [phase, baseIds]);

  const armFailsafe = useCallback(() => {
    clearTimeout(failsafeRef.current);
    failsafeRef.current = setTimeout(() => { setPayHold(false); setPhase(null); }, FAILSAFE_MS);
  }, []);

  const payEmi = useCallback(async () => {
    if (!(goal.emiAmount > 0)) return false;
    const payload = { type: 'add', amount: goal.emiAmount, date: today(), note: goal.name };

    setPayHold(true);
    setBaseIds(new Set(goal.entries.map((e) => e.id)));
    setFrozen({
      remaining: goal.remaining, percent: goal.percent, emisPaid: goal.emisPaid, emisRemaining: goal.emisRemaining,
    });
    setPhase('frozen');
    armFailsafe();

    let result = null;
    try {
      result = await savings.addEntry(goal.id, payload);
    } catch (e) {
      reportError(e);
    }
    if (!result?.success) {
      clearTimeout(failsafeRef.current);
      setPayHold(false);
      setPhase(null);
      setBaseIds(null);
      return false;
    }

    const args = { entryId: result.id, amount: payload.amount, date: payload.date, name: goal.name };
    // The final EMI has no paid moment (its own celebration plays), so it asks
    // about the expense straight away and the page is live at once.
    if (!(goal.emisRemaining > 1)) {
      emiConfirm.schedule(args);
      clearTimeout(failsafeRef.current);
      setPayHold(false);
      setPhase(null);
      return true;
    }

    confirmArgsRef.current = args;
    // An EMI payment is exactly one step, so what the moment shows is known
    // here rather than waited for off the goal's own numbers updating.
    const tenure = goal.tenureMonths;
    const quarter = (paid) => (tenure > 0 ? Math.floor((paid * 4) / tenure) : 0);
    const level = quarter(goal.emisPaid + 1);
    const crossed = level >= 1 && level <= 3 && level > quarter(goal.emisPaid);

    // The slider turns to its paid state now, behind the moment, so it is
    // already settled when the page comes back; the payment's row joins the
    // history there too.
    setPayHold(false);
    armFailsafe();
    clearTimeout(revealRef.current);
    revealRef.current = setTimeout(() => setBaseIds(null), ROW_REVEAL_MS);
    setMoment({
      title: `${MONTH_NAMES[currentMonthYear().month]} EMI paid`,
      milestone: crossed ? MILESTONE_TITLES[level - 1] : null,
      prevLeft: goal.emisRemaining,
      prevRemaining: goal.remaining,
      left: goal.emisRemaining - 1,
      remaining: Math.max(0, goal.remaining - goal.emiAmount),
    });
    return true;
  }, [savings, goal, emiConfirm, armFailsafe]);

  // Once the moment is gone the page plays its own changes one at a time so
  // each can be seen, then — after a beat — asks about the expense.
  const endMoment = useCallback(() => {
    setMoment(null);
    clearTimeout(failsafeRef.current);
    setPayHold(false);
    clearTimeout(phaseTimerRef.current);
    setPhase('bar');
    phaseTimerRef.current = setTimeout(() => {
      setPhase('dots');
      if (confirmArgsRef.current) {
        emiConfirm.schedule(confirmArgsRef.current);
        confirmArgsRef.current = null;
      }
      phaseTimerRef.current = setTimeout(() => setPhase(null), DOTS_SETTLE_MS);
    }, BAR_TO_DOTS_MS);
  }, [emiConfirm]);

  const barG = phase === 'frozen' && frozen ? frozen : goal;
  const dotG = (phase === 'frozen' || phase === 'bar') && frozen ? frozen : goal;
  const shownEntries = phase !== null && baseIds ? goal.entries.filter((e) => baseIds.has(e.id)) : goal.entries;
  const isNewEntry = useCallback((id) => !!baseIds && !baseIds.has(id), [baseIds]);

  return { moment, endMoment, payEmi, payHold, barG, dotG, shownEntries, isNewEntry };
}
