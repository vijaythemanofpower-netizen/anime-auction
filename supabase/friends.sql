-- Friends, direct room invites and the career record.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it only creates what is missing and replaces policies.

-- ------------------------------------------------------------------ career
-- The full career record (tournaments, raids, badges, MVPs, rivals) as one JSON value.
alter table public.profiles add column if not exists career jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------- friends
-- One row per request: user_id asked friend_id. Accepted when friend_id says yes.
create table if not exists public.friendships (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
drop policy if exists "see your own friendships" on public.friendships;
create policy "see your own friendships" on public.friendships for select to authenticated using (auth.uid() in (user_id, friend_id));
drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests" on public.friendships for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "accept requests sent to you" on public.friendships;
create policy "accept requests sent to you" on public.friendships for update to authenticated using (friend_id = auth.uid()) with check (friend_id = auth.uid() and status = 'accepted');
drop policy if exists "remove a friendship" on public.friendships;
create policy "remove a friendship" on public.friendships for delete to authenticated using (auth.uid() in (user_id, friend_id));
grant select, insert, update, delete on public.friendships to authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships f
    where f.status = 'accepted' and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a)));
$$;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------- invites
-- "Join my room": only to accepted friends, seen by sender and receiver only.
create table if not exists public.invites (
  id bigint generated always as identity primary key,
  from_id uuid not null default auth.uid() references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  room_code text not null check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
drop policy if exists "invite your friends" on public.invites;
create policy "invite your friends" on public.invites for insert to authenticated with check (from_id = auth.uid() and public.are_friends(from_id, to_id));
drop policy if exists "see invites you sent or got" on public.invites;
create policy "see invites you sent or got" on public.invites for select to authenticated using (auth.uid() in (from_id, to_id));
drop policy if exists "clear your invites" on public.invites;
create policy "clear your invites" on public.invites for delete to authenticated using (auth.uid() in (from_id, to_id));
grant select, insert, delete on public.invites to authenticated;

-- Invites arrive instantly through Realtime.
do $$ begin
  alter publication supabase_realtime add table public.invites;
exception when duplicate_object then null; end $$;
