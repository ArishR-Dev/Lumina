-- Final admin auth fix: idempotent, self-contained, safe after any prior partial state
-- Depends on: 20260715180000_secret_gift.sql (secret_gift_config)
-- Creates admin_sessions + admin_login_attempts if missing

create extension if not exists pgcrypto;

-- Config columns (idempotent)
alter table if exists public.secret_gift_config
  add column if not exists admin_password_hash text;

alter table if exists public.secret_gift_config
  add column if not exists admin_session_minutes int default 30;

-- Session table
create table if not exists public.admin_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_token text not null,
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- Lockout table (was introduced in 803; create here if 803 was skipped)
create table if not exists public.admin_login_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fail_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- No direct client access; RPC-only via security definer
alter table if exists public.admin_sessions disable row level security;
alter table if exists public.admin_login_attempts disable row level security;

drop policy if exists "admin_sessions_own" on public.admin_sessions;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'admin_sessions') then
    revoke all on table public.admin_sessions from anon, authenticated;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'admin_login_attempts') then
    revoke all on table public.admin_login_attempts from anon, authenticated;
  end if;
end $$;

-- Column grants: hide admin_password_hash from API (idempotent)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'secret_gift_config') then
    revoke all on table public.secret_gift_config from authenticated, anon;

    grant select (
      id, required_login_days, gift_title, gift_description, custom_message,
      image_urls, video_urls, audio_urls, animation_key, one_time,
      admin_emails, admin_session_minutes, updated_at
    ) on table public.secret_gift_config to authenticated;

    grant update (
      required_login_days, gift_title, gift_description, custom_message,
      image_urls, video_urls, audio_urls, animation_key, one_time,
      admin_emails, admin_session_minutes, updated_at
    ) on table public.secret_gift_config to authenticated;
  end if;
end $$;

-- Progress RLS: read own row or valid admin session; no direct writes
drop policy if exists "secret_gift_progress_select" on public.secret_gift_progress;
create policy "secret_gift_progress_select"
  on public.secret_gift_progress for select to authenticated
  using (auth.uid() = user_id or public.has_valid_admin_session());

drop policy if exists "secret_gift_progress_insert" on public.secret_gift_progress;
drop policy if exists "secret_gift_progress_update" on public.secret_gift_progress;

drop policy if exists "secret_gift_config_update" on public.secret_gift_config;
create policy "secret_gift_config_update"
  on public.secret_gift_config for update to authenticated
  using (public.has_valid_admin_session())
  with check (public.has_valid_admin_session());

-- Internal hash reader (not callable by clients)
create or replace function public._read_admin_password_hash()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.admin_password_hash
  from public.secret_gift_config c
  where c.id = 1;
$$;

revoke all on function public._read_admin_password_hash() from public, anon, authenticated;

create or replace function public.has_valid_admin_session()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.admin_sessions s
    where s.user_id = auth.uid() and s.expires_at > now()
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_valid_admin_session() then raise exception 'Forbidden'; end if;
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
  locked_until timestamptz;
  trimmed text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  trimmed := trim(coalesce(p_password, ''));
  if trimmed = '' then
    return json_build_object('ok', false);
  end if;

  select a.locked_until into locked_until
  from public.admin_login_attempts a
  where a.user_id = uid;

  if locked_until is not null and locked_until > now() then
    return json_build_object('ok', false);
  end if;

  stored_hash := public._read_admin_password_hash();

  if stored_hash is null or stored_hash = '' then
    return json_build_object('ok', false);
  end if;

  select coalesce(c.admin_session_minutes, 30) into mins
  from public.secret_gift_config c where c.id = 1;

  if stored_hash = crypt(trimmed, stored_hash) then
    delete from public.admin_login_attempts where user_id = uid;

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

  insert into public.admin_login_attempts (user_id, fail_count, locked_until, updated_at)
  values (uid, 1, null, now())
  on conflict (user_id) do update set
    fail_count = public.admin_login_attempts.fail_count + 1,
    locked_until = case
      when public.admin_login_attempts.fail_count + 1 >= 5
        then now() + interval '15 minutes'
      else public.admin_login_attempts.locked_until
    end,
    updated_at = now();

  return json_build_object('ok', false);
end;
$$;

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
  if auth.uid() is null then return json_build_object('ok', false); end if;

  select coalesce(c.admin_session_minutes, 30) into mins
  from public.secret_gift_config c where c.id = 1;

  update public.admin_sessions
  set
    last_activity_at = now(),
    expires_at = now() + (mins::text || ' minutes')::interval,
    updated_at = now()
  where user_id = auth.uid() and expires_at > now()
  returning * into row;

  if row is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'expires_at', row.expires_at);
end;
$$;

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

alter function public._read_admin_password_hash() owner to postgres;
alter function public.verify_admin_password(text) owner to postgres;
alter function public.touch_admin_session() owner to postgres;
alter function public.revoke_admin_session() owner to postgres;

grant execute on function public.verify_admin_password(text) to authenticated;
grant execute on function public.touch_admin_session() to authenticated;
grant execute on function public.revoke_admin_session() to authenticated;

-- Clear any lockouts so a correct password works immediately after deploy
delete from public.admin_login_attempts where true;
