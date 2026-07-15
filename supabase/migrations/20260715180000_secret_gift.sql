-- Secret Gift (unique login-day progress) + admin config
-- Login days = distinct local calendar days the user opened Lumina.

create table if not exists public.secret_gift_config (
  id int primary key default 1 check (id = 1),
  required_login_days int not null default 90 check (required_login_days >= 1),
  gift_title text not null default 'Your Secret Gift',
  gift_description text not null default
    'You kept showing up — this surprise was waiting for you.',
  custom_message text not null default
    'Congratulations. Ninety quiet days of returning to yourself.',
  image_urls jsonb not null default '[]'::jsonb,
  video_urls jsonb not null default '[]'::jsonb,
  audio_urls jsonb not null default '[]'::jsonb,
  animation_key text not null default 'cinematic-unlock',
  one_time boolean not null default true,
  admin_emails text[] not null default array['speakwithshoko@gmail.com']::text[],
  updated_at timestamptz not null default now()
);

insert into public.secret_gift_config (id) values (1)
on conflict (id) do nothing;

create table if not exists public.secret_gift_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_day_count int not null default 0 check (login_day_count >= 0),
  last_login_counted_date date,
  first_login_date date,
  gift_unlocked_at timestamptz,
  gift_opened_at timestamptz,
  notification_seen boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists secret_gift_progress_count_idx
  on public.secret_gift_progress (login_day_count desc);
create index if not exists secret_gift_progress_last_login_idx
  on public.secret_gift_progress (last_login_counted_date desc nulls last);

alter table public.secret_gift_config enable row level security;
alter table public.secret_gift_progress enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.secret_gift_config c
    where c.id = 1
      and lower(coalesce(auth.jwt()->>'email', '')) = any (
        select lower(unnest(c.admin_emails))
      )
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Config: everyone authenticated can read; only admins write
drop policy if exists "secret_gift_config_select" on public.secret_gift_config;
create policy "secret_gift_config_select"
  on public.secret_gift_config for select to authenticated
  using (true);

drop policy if exists "secret_gift_config_update" on public.secret_gift_config;
create policy "secret_gift_config_update"
  on public.secret_gift_config for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Progress: own row, or admin for everything
drop policy if exists "secret_gift_progress_select" on public.secret_gift_progress;
create policy "secret_gift_progress_select"
  on public.secret_gift_progress for select to authenticated
  using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "secret_gift_progress_insert" on public.secret_gift_progress;
create policy "secret_gift_progress_insert"
  on public.secret_gift_progress for insert to authenticated
  with check (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "secret_gift_progress_update" on public.secret_gift_progress;
create policy "secret_gift_progress_update"
  on public.secret_gift_progress for update to authenticated
  using (auth.uid() = user_id or public.is_app_admin())
  with check (auth.uid() = user_id or public.is_app_admin());

-- Count at most one login day per local calendar date; unlock at threshold
create or replace function public.record_secret_gift_login_day(p_local_date date)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  req int;
  row public.secret_gift_progress;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_local_date is null then
    raise exception 'Local date required';
  end if;

  select required_login_days into req from public.secret_gift_config where id = 1;
  if req is null then req := 90; end if;

  insert into public.secret_gift_progress (user_id, login_day_count, last_login_counted_date, first_login_date, updated_at)
  values (uid, 1, p_local_date, p_local_date, now())
  on conflict (user_id) do update
    set
      login_day_count = case
        when public.secret_gift_progress.last_login_counted_date is distinct from excluded.last_login_counted_date
          then public.secret_gift_progress.login_day_count + 1
        else public.secret_gift_progress.login_day_count
      end,
      last_login_counted_date = case
        when public.secret_gift_progress.last_login_counted_date is distinct from excluded.last_login_counted_date
          then excluded.last_login_counted_date
        else public.secret_gift_progress.last_login_counted_date
      end,
      first_login_date = coalesce(public.secret_gift_progress.first_login_date, excluded.first_login_date),
      updated_at = now()
  returning * into row;

  if row.login_day_count >= req and row.gift_unlocked_at is null then
    update public.secret_gift_progress
    set gift_unlocked_at = now(), updated_at = now()
    where user_id = uid
    returning * into row;
  end if;

  return row;
end;
$$;

revoke all on function public.record_secret_gift_login_day(date) from public;
grant execute on function public.record_secret_gift_login_day(date) to authenticated;

create or replace function public.mark_secret_gift_opened()
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.secret_gift_progress;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  update public.secret_gift_progress
  set
    gift_opened_at = coalesce(gift_opened_at, now()),
    notification_seen = true,
    updated_at = now()
  where user_id = uid
    and gift_unlocked_at is not null
  returning * into row;
  if row is null then
    raise exception 'Gift is not unlocked yet';
  end if;
  return row;
end;
$$;

revoke all on function public.mark_secret_gift_opened() from public;
grant execute on function public.mark_secret_gift_opened() to authenticated;

create or replace function public.mark_secret_gift_notification_seen()
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.secret_gift_progress;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  update public.secret_gift_progress
  set notification_seen = true, updated_at = now()
  where user_id = uid
  returning * into row;
  return row;
end;
$$;

revoke all on function public.mark_secret_gift_notification_seen() from public;
grant execute on function public.mark_secret_gift_notification_seen() to authenticated;

-- Admin: list progress with profile + email
create or replace function public.admin_secret_gift_progress_list()
returns table (
  user_id uuid,
  display_name text,
  email text,
  login_day_count int,
  last_login_counted_date date,
  first_login_date date,
  gift_unlocked_at timestamptz,
  gift_opened_at timestamptz,
  notification_seen boolean,
  updated_at timestamptz,
  required_login_days int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  req int;
begin
  if not public.is_app_admin() then
    raise exception 'Forbidden';
  end if;
  select c.required_login_days into req from public.secret_gift_config c where c.id = 1;
  return query
  select
    g.user_id,
    coalesce(p.display_name, split_part(u.email, '@', 1))::text,
    u.email::text,
    g.login_day_count,
    g.last_login_counted_date,
    g.first_login_date,
    g.gift_unlocked_at,
    g.gift_opened_at,
    g.notification_seen,
    g.updated_at,
    coalesce(req, 90)
  from public.secret_gift_progress g
  left join public.profiles p on p.id = g.user_id
  left join auth.users u on u.id = g.user_id
  order by g.login_day_count desc, g.updated_at desc;
end;
$$;

revoke all on function public.admin_secret_gift_progress_list() from public;
grant execute on function public.admin_secret_gift_progress_list() to authenticated;

create or replace function public.admin_secret_gift_adjust_days(p_user_id uuid, p_delta int)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.secret_gift_progress;
  req int;
begin
  if not public.is_app_admin() then raise exception 'Forbidden'; end if;
  select required_login_days into req from public.secret_gift_config where id = 1;
  update public.secret_gift_progress
  set
    login_day_count = greatest(0, login_day_count + p_delta),
    updated_at = now()
  where user_id = p_user_id
  returning * into row;

  if row is null then
    insert into public.secret_gift_progress (user_id, login_day_count, first_login_date, last_login_counted_date)
    values (p_user_id, greatest(0, p_delta), current_date, current_date)
    returning * into row;
  end if;

  if row.login_day_count >= coalesce(req, 90) and row.gift_unlocked_at is null then
    update public.secret_gift_progress
    set gift_unlocked_at = now(), updated_at = now()
    where user_id = p_user_id
    returning * into row;
  elsif row.login_day_count < coalesce(req, 90) then
    update public.secret_gift_progress
    set gift_unlocked_at = null, gift_opened_at = null, notification_seen = false, updated_at = now()
    where user_id = p_user_id
    returning * into row;
  end if;

  return row;
end;
$$;

revoke all on function public.admin_secret_gift_adjust_days(uuid, int) from public;
grant execute on function public.admin_secret_gift_adjust_days(uuid, int) to authenticated;

create or replace function public.admin_secret_gift_reset(p_user_id uuid)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.secret_gift_progress;
begin
  if not public.is_app_admin() then raise exception 'Forbidden'; end if;
  insert into public.secret_gift_progress (user_id, login_day_count, last_login_counted_date, first_login_date,
    gift_unlocked_at, gift_opened_at, notification_seen, updated_at)
  values (p_user_id, 0, null, null, null, null, false, now())
  on conflict (user_id) do update set
    login_day_count = 0,
    last_login_counted_date = null,
    gift_unlocked_at = null,
    gift_opened_at = null,
    notification_seen = false,
    updated_at = now()
  returning * into row;
  return row;
end;
$$;

revoke all on function public.admin_secret_gift_reset(uuid) from public;
grant execute on function public.admin_secret_gift_reset(uuid) to authenticated;

create or replace function public.admin_secret_gift_mark_opened(p_user_id uuid)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.secret_gift_progress;
begin
  if not public.is_app_admin() then raise exception 'Forbidden'; end if;
  update public.secret_gift_progress
  set
    gift_unlocked_at = coalesce(gift_unlocked_at, now()),
    gift_opened_at = coalesce(gift_opened_at, now()),
    notification_seen = true,
    updated_at = now()
  where user_id = p_user_id
  returning * into row;
  return row;
end;
$$;

revoke all on function public.admin_secret_gift_mark_opened(uuid) from public;
grant execute on function public.admin_secret_gift_mark_opened(uuid) to authenticated;
