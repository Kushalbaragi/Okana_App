-- Splits debt into two shapes, chosen once up front when a loan is added:
-- 'emi' (a fixed repayment schedule — car/bike/home/personal loan) and
-- 'flexible' (no schedule — a friend, family, informal borrowing). Null for
-- every existing debt goal and for every savings goal (this column means
-- nothing outside kind='debt') — useSavings.js's own derivation infers 'emi'
-- for an old debt goal that already has EMI-shaped data on file (a tenure or
-- an EMI amount) and 'flexible' otherwise, so nothing existing needs
-- migrating by hand.
alter table public.savings_goals
  add column debt_type text check (debt_type in ('emi', 'flexible'));
