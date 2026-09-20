-- Two gaps in the savings tables from 20260920000000_savings.sql.
--
-- 1. An entry could be moved onto someone else's goal. The INSERT policy checks
--    that the goal belongs to the caller (see the comment there), but the UPDATE
--    policy only checked user_id, so a user could UPDATE their own entry to point
--    at any goal id. Re-check ownership of the goal on update as well.
--
-- 2. `note` had no length limit. The app caps it at 80 characters, but nothing
--    stopped a direct API call storing an arbitrarily large value. 200 leaves room
--    over the app's own limit.

drop policy if exists savings_entries_update_own on public.savings_entries;

create policy savings_entries_update_own on public.savings_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.savings_goals g
      where g.id = goal_id and g.user_id = (select auth.uid())
    )
  );

alter table public.savings_entries
  add constraint savings_entries_note_length check (char_length(note) <= 200);
