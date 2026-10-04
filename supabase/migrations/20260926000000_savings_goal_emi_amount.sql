-- The monthly EMI amount — the one number about a loan most people actually
-- know by heart (the bank tells them, it's the figure that leaves their
-- account every month). Used as a fallback for "how much has this loan
-- already paid down" when outstanding_balance isn't given directly:
-- emis_paid * emi_amount, capped at the loan's own target_amount. See
-- useSavings.js's own comment on why that's an approximation (EMIs include
-- interest, not just principal) accepted on purpose for simplicity.
alter table public.savings_goals
  add column emi_amount numeric check (emi_amount >= 0);
