-- Host Portal extras: leaderboard, recent games, and a week of activity.
-- Run in the Supabase SQL Editor after admin.sql. Admin-only, like every admin_* function.

create or replace function public.admin_leaderboard()
returns table (id uuid, display_name text, games_played int, wins int, win_rate numeric, best_iq int, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.require_admin();
  return query
    select p.id, p.display_name, p.games_played, p.wins,
      case when p.games_played > 0 then round(100.0 * p.wins / p.games_played, 0) else 0 end,
      p.best_iq, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.games_played > 0
    order by p.wins desc, p.games_played asc
    limit 25;
end;
$$;
grant execute on function public.admin_leaderboard() to authenticated;

create or replace function public.admin_games()
returns table (id text, name text, room_code text, host text, updated_at timestamptz, size_kb int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select s.id, s.name, s.room_code, coalesce(p.display_name, 'unknown'), s.updated_at, (length(s.data) / 1024)::int
    from public.game_saves s left join public.profiles p on p.id = s.owner
    order by s.updated_at desc
    limit 40;
end;
$$;
grant execute on function public.admin_games() to authenticated;

create or replace function public.admin_activity()
returns table (day date, new_players int, games int, rooms int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select d::date,
      (select count(*)::int from public.profiles where created_at::date = d::date),
      (select count(*)::int from public.game_saves where updated_at::date = d::date),
      (select count(*)::int from public.rooms where created_at::date = d::date)
    from generate_series(current_date - 6, current_date, interval '1 day') d
    order by 1;
end;
$$;
grant execute on function public.admin_activity() to authenticated;
