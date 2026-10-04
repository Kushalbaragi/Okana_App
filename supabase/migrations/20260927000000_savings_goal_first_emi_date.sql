-- Replaces manually typing "how many EMIs have I paid" with a date most
-- people actually know without counting: when the first EMI was due. A date
-- in the past derives how many EMIs have already gone (this is an existing
-- loan); a date in the future means none have (a brand-new one) — see
-- useSavings.js's own comment on the derivation. emis_paid/outstanding_balance
-- stay as columns (nothing dropped) so a goal saved before this change keeps
-- reading correctly; first_emi_date simply takes over for every goal saved
-- from here on.
alter table public.savings_goals
  add column first_emi_date date;
