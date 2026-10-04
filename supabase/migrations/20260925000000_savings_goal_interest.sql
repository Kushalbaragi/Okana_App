-- First slice of the debt tracker's interest-aware rework: the two inputs
-- everything else (interest paid, interest saved by prepaying) is computed
-- from. Both nullable — a loan can go without either (an interest-free loan
-- from a friend has no rate; a brand-new loan has no "current balance"
-- distinct from what it started at), and existing rows get NULL for both,
-- same as tenure_months/emis_paid before them.
alter table public.savings_goals
  add column interest_rate      numeric check (interest_rate >= 0),
  add column outstanding_balance numeric check (outstanding_balance >= 0);
