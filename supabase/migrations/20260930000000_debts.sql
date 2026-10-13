-- Debt gets its own tables, split out of savings_goals / savings_entries
-- (where it lived as kind = 'debt'). Same shape and conventions as those
-- tables: a debt (what was borrowed + its EMI schedule) and a ledger of
-- payments against it. `type` keeps 'add' (a payment) / 'withdraw' (a payment
-- taken back) so the app's existing derivations carry over unchanged.
--
-- The existing debt rows are COPIED, not moved, with their ids kept. Installed
-- 3.0.x apps still read debt from savings_goals, so those rows stay until a
-- later migration drops them once the new version has rolled out.

create table public.debts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  target_amount  numeric not null check (target_amount > 0),
  location       text not null default '' check (char_length(location) <= 40),
  debt_type      text not null check (debt_type in ('emi', 'flexible')),
  tenure_months  integer check (tenure_months is null or tenure_months > 0),
  emis_paid      integer not null default 0 check (emis_paid >= 0),
  emi_amount     numeric check (emi_amount >= 0),
  first_emi_date date,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.debt_payments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references public.debts (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('add', 'withdraw')),
  amount         numeric not null check (amount > 0),
  date           date not null default current_date,
  note           text not null default '' check (char_length(note) <= 200),
  created_at     timestamptz not null default now(),
  transaction_id uuid references public.transactions (id) on delete set null
);

create index debts_user_id_idx            on public.debts (user_id);
create index debt_payments_debt_id_idx    on public.debt_payments (debt_id);
create index debt_payments_user_id_idx    on public.debt_payments (user_id);
create index debt_payments_transaction_id_idx on public.debt_payments (transaction_id);

alter table public.debts         enable row level security;
alter table public.debt_payments enable row level security;

create policy debts_select_own on public.debts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy debts_insert_own on public.debts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy debts_update_own on public.debts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy debts_delete_own on public.debts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy debt_payments_select_own on public.debt_payments
  for select to authenticated using ((select auth.uid()) = user_id);
-- A payment may only be written against a debt the caller owns, on insert and
-- on update (see 20260921000000_savings_entries_owner_checks.sql for why both).
create policy debt_payments_insert_own on public.debt_payments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.debts d
      where d.id = debt_id and d.user_id = (select auth.uid())
    )
  );
create policy debt_payments_update_own on public.debt_payments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.debts d
      where d.id = debt_id and d.user_id = (select auth.uid())
    )
  );
create policy debt_payments_delete_own on public.debt_payments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Copy what's already there. A debt saved before the EMI/flexible split has no
-- debt_type; infer it the way the app always has (a tenure or EMI amount on
-- file means 'emi').
insert into public.debts (
  id, user_id, name, target_amount, location, debt_type, tenure_months,
  emis_paid, emi_amount, first_emi_date, completed_at, created_at
)
select
  id, user_id, name, target_amount, location,
  coalesce(debt_type, case when tenure_months is not null or emi_amount is not null then 'emi' else 'flexible' end),
  tenure_months, emis_paid, emi_amount, first_emi_date, completed_at, created_at
from public.savings_goals
where kind = 'debt'
on conflict (id) do nothing;

insert into public.debt_payments (id, debt_id, user_id, type, amount, date, note, created_at, transaction_id)
select e.id, e.goal_id, e.user_id, e.type, e.amount, e.date, e.note, e.created_at, e.transaction_id
from public.savings_entries e
join public.savings_goals g on g.id = e.goal_id
where g.kind = 'debt'
on conflict (id) do nothing;
