-- Hidden admin access: password verification + inactivity-based sessions
-- Depends on: 20260715180000_secret_gift.sql

create extension if not exists pgcrypto;

alter table public.secret_gift_config
  add column if not exists admin_password_hash text;

alter table public.secret_gift_config
  add column if not exists admin_session_minutes int default 30;

-- Add NOT NULL + check only when column was just created (safe re-run)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'secret_gift_config'
      and column_name = 'admin_session_minutes'
      and is_nullable = 'YES'
  ) then
    update public.secret_gift_config set admin_session_minutes = 30 where admin_session_minutes is null;
    alter table public.secret_gift_config alter column admin_session_minutes set not null;
    alter table public.secret_gift_config alter column admin_session_minutes set default 30;
  end if;
exception when others then null;
end $$;

create table if not exists public.admin_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_token text not null,
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;

drop policy if exists "admin_sessions_own" on public.admin_sessions;
create policy "admin_sessions_own"
  on public.admin_sessions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.has_valid_admin_session()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.admin_sessions s
    where s.user_id = auth.uid()
      and s.expires_at > now()
  );
$$;

revoke all on function public.has_valid_admin_session() from public;
grant execute on function public.has_valid_admin_session() to authenticated;

create or replace function public.assert_admin_access()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.has_valid_admin_session() then
    raise exception 'Forbidden';
  end if;
end;
$$;

revoke all on function public.assert_admin_access() from public;
grant execute on function public.assert_admin_access() to authenticated;

create or replace function public.verify_admin_password(p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  stored_hash text;
  mins int;
  new_token text;
  exp timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_password is null or length(trim(p_password)) = 0 then
    return json_build_object('ok', false);
  end if;

  select c.admin_password_hash, coalesce(c.admin_session_minutes, 30)
  into stored_hash, mins
  from public.secret_gift_config c
  where c.id = 1;

  if stored_hash is null or stored_hash = '' then
    return json_build_object('ok', false);
  end if;

  if stored_hash = crypt(trim(p_password), stored_hash) then
    new_token := encode(gen_random_bytes(32), 'hex');
    exp := now() + (mins::text || ' minutes')::interval;

    insert into public.admin_sessions (user_id, session_token, expires_at, last_activity_at, updated_at)
    values (uid, new_token, exp, now(), now())
    on conflict (user_id) do update set
      session_token = excluded.session_token,
      expires_at = excluded.expires_at,
      last_activity_at = now(),
      updated_at = now();

    return json_build_object('ok', true, 'expires_at', exp);
  end if;

  return json_build_object('ok', false);
end;
$$;

revoke all on function public.verify_admin_password(text) from public;
grant execute on function public.verify_admin_password(text) to authenticated;

create or replace function public.touch_admin_session()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mins int;
  row public.admin_sessions;
begin
  if auth.uid() is null then
    return json_build_object('ok', false);
  end if;

  select coalesce(c.admin_session_minutes, 30) into mins
  from public.secret_gift_config c where c.id = 1;

  update public.admin_sessions
  set
    last_activity_at = now(),
    expires_at = now() + (mins::text || ' minutes')::interval,
    updated_at = now()
  where user_id = auth.uid()
    and expires_at > now()
  returning * into row;

  if row is null then
    return json_build_object('ok', false);
  end if;

  return json_build_object('ok', true, 'expires_at', row.expires_at);
end;
$$;

revoke all on function public.touch_admin_session() from public;
grant execute on function public.touch_admin_session() to authenticated;

create or replace function public.revoke_admin_session()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.admin_sessions where user_id = auth.uid();
end;
$$;

revoke all on function public.revoke_admin_session() from public;
grant execute on function public.revoke_admin_session() to authenticated;

-- Guard all admin RPCs with session check
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
set search_path = public, extensions
as $$
declare
  req int;
begin
  perform public.assert_admin_access();
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

create or replace function public.admin_secret_gift_adjust_days(p_user_id uuid, p_delta int)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  row public.secret_gift_progress;
  req int;
begin
  perform public.assert_admin_access();
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

create or replace function public.admin_secret_gift_reset(p_user_id uuid)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  row public.secret_gift_progress;
begin
  perform public.assert_admin_access();
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

create or replace function public.admin_secret_gift_mark_opened(p_user_id uuid)
returns public.secret_gift_progress
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  row public.secret_gift_progress;
begin
  perform public.assert_admin_access();
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

drop policy if exists "secret_gift_config_update" on public.secret_gift_config;
create policy "secret_gift_config_update"
  on public.secret_gift_config for update to authenticated
  using (public.has_valid_admin_session())
  with check (public.has_valid_admin_session());
