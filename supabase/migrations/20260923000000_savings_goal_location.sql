-- Where a goal's money actually sits (bank, liquid fund, chit fund, ...).
-- Free text, not an enum: the point is to match however the user thinks of
-- it, not to constrain them to a fixed list. Optional, so existing goals
-- default to the empty string rather than needing a backfill.

alter table public.savings_goals
  add column location text not null default '' check (char_length(location) <= 40);
