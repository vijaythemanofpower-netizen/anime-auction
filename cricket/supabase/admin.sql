-- Host Portal: admin accounts and the admin-only actions behind admin.html.
-- Run after schema.sql (SQL Editor -> New query -> paste -> Run). Safe to run again.
-- Every admin_* function checks is_admin() itself, so a normal player who
-- calls one gets "Admins only." no matter what the page shows.

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- no policies: only the functions below touch it

alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
end;
$$;

-- Banned players can't create or join rooms.
create or replace function public.create_room(p_display text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then raise exception 'Your account has been blocked from online play.'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  insert into public.rooms (code, host_id) values (v_code, auth.uid());
  insert into public.room_members (room_code, user_id, display_name) values (v_code, auth.uid(), left(p_display, 24));
  return v_code;
end;
$$;

create or replace function public.join_room(p_code text, p_display text) returns public.rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then raise exception 'Your account has been blocked from online play.'; end if;
  select * into v_room from public.rooms where code = upper(trim(p_code));
  if not found then raise exception 'No room with that code.'; end if;
  if exists (select 1 from public.room_members where room_code = v_room.code and user_id = auth.uid()) then
    update public.room_members set display_name = left(p_display, 24) where room_code = v_room.code and user_id = auth.uid();
    return v_room;
  end if;
  if v_room.status <> 'lobby' then raise exception 'That game has already started.'; end if;
  if (select count(*) from public.room_members where room_code = v_room.code) >= 6 then raise exception 'That room is full (6 players).'; end if;
  insert into public.room_members (room_code, user_id, display_name) values (v_room.code, auth.uid(), left(p_display, 24));
  return v_room;
end;
$$;

-- Hosts mark their room as active while a game runs (shown in the portal).
create or replace function public.touch_room(p_code text) returns void
language sql security definer set search_path = public as $$
  update public.rooms set updated_at = now() where code = p_code and host_id = auth.uid();
$$;
grant execute on function public.touch_room(text) to authenticated;

-- ----------------------------------------------------------- dashboard
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public, storage as $$
declare v json;
begin
  perform public.require_admin();
  select json_build_object(
    'rooms_total', (select count(*) from public.rooms),
    'rooms_active_hour', (select count(*) from public.rooms where updated_at > now() - interval '1 hour'),
    'rooms_playing', (select count(*) from public.rooms where status = 'playing'),
    'players_total', (select count(*) from public.profiles),
    'players_guest', (select count(*) from public.profiles p join auth.users u on u.id = p.id where u.is_anonymous),
    'players_new_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'players_banned', (select count(*) from public.profiles where banned),
    'games_saved_day', (select count(*) from public.game_saves where updated_at > now() - interval '1 day'),
    'panels', (select count(*) from storage.objects where bucket_id = 'comics'),
    'panel_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'comics')
  ) into v;
  return v;
end;
$$;

-- ----------------------------------------------------------------- rooms
create or replace function public.admin_rooms()
returns table (code text, host_id uuid, host_name text, status text, players int, names text[], panels int, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  perform public.require_admin();
  return query
    select r.code, r.host_id,
      coalesce((select m.display_name from public.room_members m where m.room_code = r.code and m.user_id = r.host_id), '?'),
      r.status,
      (select count(*)::int from public.room_members m where m.room_code = r.code),
      array(select m.display_name from public.room_members m where m.room_code = r.code order by m.joined_at),
      (select count(*)::int from storage.objects o where o.bucket_id = 'comics' and o.name like r.code || '/%'),
      r.created_at, r.updated_at
    from public.rooms r
    order by r.updated_at desc;
end;
$$;

create or replace function public.admin_close_room(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.rooms where code = p_code;
end;
$$;

create or replace function public.admin_kick(p_code text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.room_members where room_code = p_code and user_id = p_user;
end;
$$;

create or replace function public.admin_room_members(p_code text)
returns table (user_id uuid, display_name text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select m.user_id, m.display_name, m.joined_at from public.room_members m where m.room_code = p_code order by m.joined_at;
end;
$$;

-- --------------------------------------------------------------- players
create or replace function public.admin_players()
returns table (id uuid, display_name text, email text, is_guest boolean, games_played int, wins int, best_iq int, banned boolean, is_admin boolean, joined_at timestamptz, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.require_admin();
  return query
    select p.id, p.display_name, u.email::text, coalesce(u.is_anonymous, false), p.games_played, p.wins, p.best_iq, p.banned,
      exists (select 1 from public.admins a where a.user_id = p.id), u.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    order by u.last_sign_in_at desc nulls last;
end;
$$;

create or replace function public.admin_rename(p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if char_length(trim(p_name)) not between 1 and 24 then raise exception 'Names are 1 to 24 characters.'; end if;
  update public.profiles set display_name = trim(p_name), updated_at = now() where id = p_user;
  update public.room_members set display_name = trim(p_name) where user_id = p_user;
end;
$$;

create or replace function public.admin_ban(p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'You can''t ban yourself.'; end if;
  update public.profiles set banned = p_banned where id = p_user;
  -- A banned player also leaves every room they're in.
  if p_banned then delete from public.room_members where user_id = p_user; end if;
end;
$$;

-- --------------------------------------------------------------- cleanup
-- Deletes rooms not active for p_days days and returns their codes, so the
-- portal can delete their comic panels from storage.
create or replace function public.admin_cleanup(p_days int) returns text[]
language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  perform public.require_admin();
  if p_days < 1 then raise exception 'Pick at least 1 day.'; end if;
  select coalesce(array_agg(code), '{}') into v from public.rooms where updated_at < now() - make_interval(days => p_days);
  delete from public.rooms where code = any(v);
  delete from public.game_saves where updated_at < now() - make_interval(days => p_days) and room_code = any(v);
  return v;
end;
$$;

-- ---------------------------------------------------------------- admins
create or replace function public.admin_list()
returns table (user_id uuid, display_name text, email text, added_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.require_admin();
  return query select a.user_id, p.display_name, u.email::text, a.added_at
    from public.admins a join auth.users u on u.id = a.user_id left join public.profiles p on p.id = a.user_id
    order by a.added_at;
end;
$$;

create or replace function public.admin_add(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v uuid;
begin
  perform public.require_admin();
  select id into v from auth.users where lower(email) = lower(trim(p_email)) and not coalesce(is_anonymous, false);
  if v is null then raise exception 'No email account with that address. They need to sign in by email once first.'; end if;
  insert into public.admins (user_id) values (v) on conflict do nothing;
end;
$$;

create or replace function public.admin_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if (select count(*) from public.admins) <= 1 then raise exception 'There must always be at least one admin.'; end if;
  delete from public.admins where user_id = p_user;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_overview()', 'admin_rooms()', 'admin_close_room(text)', 'admin_kick(text, uuid)', 'admin_room_members(text)',
    'admin_players()', 'admin_rename(uuid, text)', 'admin_ban(uuid, boolean)', 'admin_cleanup(int)', 'admin_list()', 'admin_add(text)', 'admin_remove(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Admins may list and delete any room's comic panels (for closing rooms and cleanup).
drop policy if exists "admins list comic panels" on storage.objects;
create policy "admins list comic panels" on storage.objects for select to authenticated
  using (bucket_id = 'comics' and public.is_admin());
drop policy if exists "admins remove comic panels" on storage.objects;
create policy "admins remove comic panels" on storage.objects for delete to authenticated
  using (bucket_id = 'comics' and public.is_admin());
