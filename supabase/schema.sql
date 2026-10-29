-- Anime Auction online play: profiles, rooms joined by code, cloud saves.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it only creates what is missing and replaces functions/policies.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  games_played int not null default 0,
  wins int not null default 0,
  best_iq int,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are visible to signed-in players" on public.profiles;
create policy "profiles are visible to signed-in players" on public.profiles for select to authenticated using (true);
drop policy if exists "players create their own profile" on public.profiles;
create policy "players create their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "players edit their own profile" on public.profiles;
create policy "players edit their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ------------------------------------------------------------------- rooms
create table if not exists public.rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.room_members (
  room_code text not null references public.rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

-- Security definer so policies can ask "is this player in the room?" without recursion.
create or replace function public.is_room_member(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_code = p_code and user_id = auth.uid());
$$;

-- Rooms are found only by their code (through join_room), never listed.
drop policy if exists "members see their rooms" on public.rooms;
create policy "members see their rooms" on public.rooms for select to authenticated using (public.is_room_member(code));
drop policy if exists "hosts update their rooms" on public.rooms;
create policy "hosts update their rooms" on public.rooms for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists "hosts delete their rooms" on public.rooms;
create policy "hosts delete their rooms" on public.rooms for delete to authenticated using (host_id = auth.uid());

drop policy if exists "members see each other" on public.room_members;
create policy "members see each other" on public.room_members for select to authenticated using (public.is_room_member(room_code));
drop policy if exists "players leave, hosts remove" on public.room_members;
create policy "players leave, hosts remove" on public.room_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.rooms r where r.code = room_code and r.host_id = auth.uid()));

-- Creates a room with a fresh 6-character code and makes the caller its host.
create or replace function public.create_room(p_display text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
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

-- Joins a room by code (or rejoins one you are already in). At most 6 players.
create or replace function public.join_room(p_code text, p_display text) returns public.rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
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

-- New projects may not expose tables automatically; grant what signed-in players need (rules above still apply).
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update, delete on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.is_room_member(text) to authenticated;

-- -------------------------------------------------------------- cloud saves
-- The host's full game (including hidden stats), readable only by its owner.
create table if not exists public.game_saves (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  room_code text,
  name text not null,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.game_saves enable row level security;
grant select, insert, update, delete on public.game_saves to authenticated;
drop policy if exists "owners manage their saves" on public.game_saves;
create policy "owners manage their saves" on public.game_saves for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------------------------------------------------- live room channels
-- Private Realtime channels named room:<CODE>; only that room's members can
-- send or receive on them.
drop policy if exists "room members receive" on realtime.messages;
create policy "room members receive" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and public.is_room_member(split_part(realtime.topic(), ':', 2)));
drop policy if exists "room members send" on realtime.messages;
create policy "room members send" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and public.is_room_member(split_part(realtime.topic(), ':', 2)));
