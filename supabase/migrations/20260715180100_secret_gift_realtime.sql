-- Enable realtime for secret gift progress (admin tracker + user live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.secret_gift_progress;

-- Enforce one_time: when enabled, mark_secret_gift_opened is idempotent after first open
create or replace function public.mark_secret_gift_opened()
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.secret_gift_progress;
  cfg_one_time boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select coalesce(c.one_time, true) into cfg_one_time
  from public.secret_gift_config c where c.id = 1;

  select * into row from public.secret_gift_progress where user_id = uid;
  if row is null then
    raise exception 'Gift progress not found';
  end if;
  if row.gift_unlocked_at is null then
    raise exception 'Gift is not unlocked yet';
  end if;

  if cfg_one_time and row.gift_opened_at is not null then
    return row;
  end if;

  update public.secret_gift_progress
  set
    gift_opened_at = coalesce(gift_opened_at, now()),
    notification_seen = true,
    updated_at = now()
  where user_id = uid
  returning * into row;

  return row;
end;
$$;
