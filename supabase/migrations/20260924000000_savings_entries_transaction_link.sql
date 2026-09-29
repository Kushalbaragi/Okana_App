-- Links a debt entry to the expense it was mirrored into (see useSavings.js's
-- own logEntryAsExpense) — mirrors budget_plan_items.transaction_id exactly,
-- same reasoning: deleting the entry should take its linked expense with it,
-- not leave it behind with nothing left to explain it.
alter table public.savings_entries
  add column transaction_id uuid references public.transactions (id) on delete set null;
