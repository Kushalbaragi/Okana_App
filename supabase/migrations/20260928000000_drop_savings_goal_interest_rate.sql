-- Dropped, not just hidden from the sheet — interest rate never drove any
-- calculation (the debt tracker deliberately stayed away from amortization
-- math, see this session's own discussion) and was never in the actual
-- 5-field design (name, amount, tenure, first EMI date, monthly EMI) it
-- converged on. Safe to drop outright: added this same session, so no real
-- loan has a value in it yet.
alter table public.savings_goals
  drop column interest_rate;
