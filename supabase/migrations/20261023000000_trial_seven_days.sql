-- The free trial for new signups goes from 30 days to 7.
--
-- Only new accounts are affected: a trial already running keeps the expires_at it was
-- given at signup, and access is read from that.
--
-- grant_free_trial_on_signup: the trial a new account starts with.
-- has_active_access: the app-granted trial is now decided by expires_at alone. It used
-- to also pass for 30 days from trial_start, which would have kept a 7-day trial alive
-- for 23 more days. That fallback stays for the older Razorpay mandates, which were
-- created with a 30-day window.

create or replace function public.grant_free_trial_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into subscriptions (
    user_id, razorpay_subscription_id, status, platform,
    trial_start, expires_at, is_trial, auto_renew
  ) values (
    new.id,
    'apptrial_' || new.id,
    'authenticated',
    'app',
    current_date,
    now() + interval '7 days',
    true,
    true
  );
  return new;
end;
$function$;

create or replace function public.has_active_access(check_user_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (
      select
        (s.expires_at is not null and s.expires_at > now())
        or (s.status = 'authenticated' and s.platform <> 'app' and s.trial_start is not null and current_date < (s.trial_start + 30))
      from subscriptions s
      where s.user_id = check_user_id
    ),
    false
  )
$function$;
