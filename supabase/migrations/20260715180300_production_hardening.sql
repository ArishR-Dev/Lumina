-- Production hardening: close admin bypasses and sensitive column exposure
-- Depends on: 20260715180200_admin_access.sql (admin_sessions)

-- Ensure prerequisite table exists (idempotent safety net if 802 was skipped)
create table if not exists public.admin_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_token text not null,
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- Rate-limit password attempts
create table if not exists public.admin_login_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fail_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 1) admin_sessions: block direct client writes (session forgery bypass)
drop policy if exists "admin_sessions_own" on public.admin_sessions;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'admin_sessions') then
    revoke all on table public.admin_sessions from authenticated;
    revoke all on table public.admin_sessions from anon;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'admin_login_attempts') then
    revoke all on table public.admin_login_attempts from authenticated;
    revoke all on table public.admin_login_attempts from anon;
  end if;
end $$;

alter table if exists public.admin_login_attempts enable row level security;

-- 2) secret_gift_config: hide admin_password_hash from API reads
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'secret_gift_config') then
    revoke all on table public.secret_gift_config from authenticated;
    revoke all on table public.secret_gift_config from anon;

    grant select (
      id,
      required_login_days,
      gift_title,
      gift_description,
      custom_message,
      image_urls,
      video_urls,
      audio_urls,
      animation_key,
      one_time,
      admin_emails,
      admin_session_minutes,
      updated_at
    ) on table public.secret_gift_config to authenticated;

    grant update (
      required_login_days,
      gift_title,
      gift_description,
      custom_message,
      image_urls,
      video_urls,
      audio_urls,
      animation_key,
      one_time,
      admin_emails,
      admin_session_minutes,
      updated_at
    ) on table public.secret_gift_config to authenticated;
  end if;
end $$;

-- 3) secret_gift_progress: users read own row only; no direct writes (RPCs only)
drop policy if exists "secret_gift_progress_select" on public.secret_gift_progress;
create policy "secret_gift_progress_select"
  on public.secret_gift_progress for select to authenticated
  using (
    auth.uid() = user_id
    or public.has_valid_admin_session()
  );

drop policy if exists "secret_gift_progress_insert" on public.secret_gift_progress;
drop policy if exists "secret_gift_progress_update" on public.secret_gift_progress;

-- 4) verify_admin_password with lockout (superseded by 804; kept for incremental upgrades)
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

  select c.admin_password_hash, coalesce(c.admin_session_minutes, 30)
  into stored_hash, mins
  from public.secret_gift_config c
  where c.id = 1;

  if stored_hash is null or stored_hash = '' then
    return json_build_object('ok', false);
  end if;

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
