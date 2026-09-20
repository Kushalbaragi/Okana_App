-- Savings goals: a goal (name + target) and a ledger of money added to /
-- withdrawn from it. A goal's saved amount is derived from its entries, never
-- stored, so an entry can be corrected or removed without drifting.
--
-- Mirrors the conventions of public.transactions / public.monthly_budgets:
-- text `type` with a CHECK, positive `amount`, a plain `date`, and one RLS
-- policy per command keyed on (select auth.uid()) = user_id.
--
-- Unlike those two tables, the user_id FKs here CASCADE. monthly_budgets has a
-- no-cascade FK to auth.users, which is why account deletion has to clear it by
-- hand before delete_user() will succeed; these tables shouldn't add to that.

create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  target_amount numeric not null check (target_amount > 0),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.savings_entries (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.savings_goals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('add', 'withdraw')),
  amount     numeric not null check (amount > 0),
  date       date not null default current_date,
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index savings_goals_user_id_idx   on public.savings_goals (user_id);
create index savings_entries_goal_id_idx on public.savings_entries (goal_id);
create index savings_entries_user_id_idx on public.savings_entries (user_id);

alter table public.savings_goals   enable row level security;
alter table public.savings_entries enable row level security;

create policy savings_goals_select_own on public.savings_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy savings_goals_insert_own on public.savings_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy savings_goals_update_own on public.savings_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy savings_goals_delete_own on public.savings_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy savings_entries_select_own on public.savings_entries
  for select to authenticated using ((select auth.uid()) = user_id);
-- An entry may only be written against a goal the caller owns; without the
-- exists() check a user could attach entries to someone else's goal id.
create policy savings_entries_insert_own on public.savings_entries
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.savings_goals g
      where g.id = goal_id and g.user_id = (select auth.uid())
    )
  );
create policy savings_entries_update_own on public.savings_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy savings_entries_delete_own on public.savings_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
