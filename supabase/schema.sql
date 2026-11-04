create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'DRIFTER' check (char_length(display_name) between 1 and 24),
  avatar text not null default 'skyline'
    check (avatar in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')),
  xp bigint not null default 0 check (xp >= 0),
  total_score bigint not null default 0 check (total_score >= 0),
  best_score bigint not null default 0 check (best_score >= 0),
  total_play_seconds bigint not null default 0 check (total_play_seconds >= 0),
  runs_completed bigint not null default 0 check (runs_completed >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null check (jsonb_typeof(save_data) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  mode text not null check (mode in ('race', 'chase', 'freeplay')),
  score integer not null check (score >= 0),
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  completed boolean not null default false,
  xp_earned integer not null default 0 check (xp_earned >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, run_id)
);

alter table public.profiles add column if not exists player_tag text;
update public.profiles
set player_tag = upper(left(display_name, 12)) || '#' ||
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where player_tag is null;
alter table public.profiles alter column player_tag set not null;
create unique index if not exists profiles_player_tag_unique on public.profiles (player_tag);

create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by = user_a or requested_by = user_b)
);

create table if not exists public.profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists profile_follows_following_idx
  on public.profile_follows (following_id);

create table if not exists public.time_attack_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (track_id in ('circuit', 'tech', 'flow', 'dock')),
  time_ms integer not null check (time_ms between 1 and 86400000),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.time_attack_records
  add column if not exists car_id text
    check (car_id is null or car_id in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86'));
alter table public.time_attack_records
  add column if not exists car_setup jsonb
    check (car_setup is null or jsonb_typeof(car_setup) = 'object');

alter table public.profiles enable row level security;
alter table public.player_saves enable row level security;
alter table public.game_runs enable row level security;
alter table public.friendships enable row level security;
alter table public.profile_follows enable row level security;
alter table public.time_attack_records enable row level security;

drop policy if exists "Players can view their own profile" on public.profiles;
create policy "Players can view their own profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Players can update their own profile" on public.profiles;
create policy "Players can update their own profile"
  on public.profiles for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Players can view their own runs" on public.game_runs;
create policy "Players can view their own runs"
  on public.game_runs for select to authenticated using ((select auth.uid()) = user_id);

revoke update on public.profiles from authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;
grant select on public.profiles, public.game_runs to authenticated;
revoke all on public.profile_follows from public, anon, authenticated;

create or replace function public.load_player_save()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  saved jsonb;
begin
  if player_id is null then
    raise exception 'Sign in is required to load game data.';
  end if;
  select jsonb_build_object('save_data', s.save_data, 'updated_at', s.updated_at)
    into saved
  from public.player_saves s
  where s.user_id = player_id;
  return saved;
end;
$$;

create or replace function public.save_player_save(p_save_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  saved_at timestamptz;
begin
  if player_id is null then
    raise exception 'Sign in is required to save game data.';
  end if;
  if p_save_data is null
    or jsonb_typeof(p_save_data) <> 'object'
    or length(p_save_data::text) > 65536 then
    raise exception 'Invalid game save data.';
  end if;
  insert into public.player_saves (user_id, save_data)
  values (player_id, p_save_data)
  on conflict (user_id) do update
  set save_data = excluded.save_data, updated_at = now()
  returning updated_at into saved_at;
  return saved_at;
end;
$$;

revoke all on function public.load_player_save() from public;
revoke all on function public.save_player_save(jsonb) from public;
grant execute on function public.load_player_save() to authenticated;
grant execute on function public.save_player_save(jsonb) to authenticated;

create or replace function public.create_player_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_name text;
begin
  player_name := coalesce(
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 24), ''),
    'DRIFTER'
  );
  insert into public.profiles (id, display_name, player_tag)
  values (
    new.id,
    player_name,
    upper(left(player_name, 12)) || '#' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_player_profile();

create or replace function public.record_game_run(
  p_run_id uuid,
  p_mode text,
  p_score integer,
  p_duration_seconds integer,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  player_name text;
  previous_score integer := 0;
  previous_duration integer := 0;
  previous_xp integer := 0;
  previous_completed boolean := false;
  had_previous boolean;
  updated_score integer;
  updated_duration integer;
  updated_xp integer;
  updated_completed boolean;
begin
  if player_id is null then
    raise exception 'Sign in is required to save game progress.';
  end if;
  if p_run_id is null
    or p_mode is null or p_mode not in ('race', 'freeplay')
    or p_score is null or p_score < 0 or p_score > 1000000000
    or p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 86400
    or p_completed is null then
    raise exception 'Invalid run data.';
  end if;

  select coalesce(
    nullif(left(trim(u.raw_user_meta_data ->> 'display_name'), 24), ''),
    'DRIFTER'
  )
  into player_name
  from auth.users u
  where u.id = player_id;
  player_name := coalesce(player_name, 'DRIFTER');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(player_id::text || ':' || p_run_id::text, 0)
  );

  select r.score, r.duration_seconds, r.xp_earned, r.completed
    into previous_score, previous_duration, previous_xp, previous_completed
  from public.game_runs r
  where r.user_id = player_id and r.run_id = p_run_id
  for update;
  had_previous := found;
  if not had_previous then
    previous_score := 0;
    previous_duration := 0;
    previous_xp := 0;
    previous_completed := false;
  end if;

  updated_score := greatest(previous_score, p_score);
  updated_duration := greatest(previous_duration, p_duration_seconds);
  updated_completed := previous_completed or p_completed;
  updated_xp := greatest(1, (updated_score / 100) + (updated_duration / 30))
    + case when updated_completed then 10 else 0 end;

  if had_previous then
    update public.game_runs
    set score = updated_score,
        duration_seconds = updated_duration,
        completed = updated_completed,
        xp_earned = updated_xp
    where user_id = player_id and run_id = p_run_id;
  else
    insert into public.game_runs (
      user_id, run_id, mode, score, duration_seconds, completed, xp_earned
    ) values (
      player_id, p_run_id, p_mode, updated_score, updated_duration,
      updated_completed, updated_xp
    );
  end if;

  insert into public.profiles (
    id, display_name, player_tag, xp, total_score, best_score, total_play_seconds, runs_completed
  ) values (
    player_id,
    player_name,
    upper(left(player_name, 12)) || '#' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    updated_xp - previous_xp,
    updated_score - previous_score,
    updated_score,
    updated_duration - previous_duration,
    case when updated_completed and not previous_completed then 1 else 0 end
  )
  on conflict (id) do update set
    xp = public.profiles.xp + excluded.xp,
    total_score = public.profiles.total_score + excluded.total_score,
    best_score = greatest(public.profiles.best_score, excluded.best_score),
    total_play_seconds = public.profiles.total_play_seconds + excluded.total_play_seconds,
    runs_completed = public.profiles.runs_completed + excluded.runs_completed,
    updated_at = now();
end;
$$;

revoke all on function public.record_game_run(uuid, text, integer, integer, boolean) from public;
grant execute on function public.record_game_run(uuid, text, integer, integer, boolean) to authenticated;

drop function if exists public.search_players(text);

create function public.search_players(p_tag text)
returns table(
  player_id uuid,
  display_name text,
  player_tag text,
  avatar text,
  car_id text,
  car_setup jsonb
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.player_tag, p.avatar,
    saved_car.car_id, saved_car.car_setup
  from public.profiles p
  left join public.player_saves s on s.user_id = p.id
  left join lateral (
    select case when s.save_data ->> 'selectedCar'
      in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
      then s.save_data ->> 'selectedCar' end as car_id,
      case when jsonb_typeof(s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar')) = 'object'
        then s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar') end as car_setup
  ) saved_car on true
  where auth.uid() is not null
    and p.id <> auth.uid()
    and upper(p.player_tag) = upper(trim(p_tag))
  limit 1;
$$;

drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_player_id uuid)
returns table(
  profile_id uuid,
  display_name text,
  avatar text,
  follower_count bigint,
  following_count bigint,
  is_following boolean,
  is_self boolean,
  is_dev boolean,
  car_id text,
  car_setup jsonb
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar,
    (select count(*) from public.profile_follows f where f.following_id = p.id),
    (select count(*) from public.profile_follows f where f.follower_id = p.id),
    exists (
      select 1 from public.profile_follows f
      where f.follower_id = auth.uid() and f.following_id = p.id
    ),
    p.id = auth.uid(),
    p.player_tag = 'CAYBZ#F66865D2F18B',
    saved_car.car_id,
    saved_car.car_setup
  from public.profiles p
  left join public.player_saves s on s.user_id = p.id
  left join lateral (
    select case when s.save_data ->> 'selectedCar'
      in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
      then s.save_data ->> 'selectedCar' end as car_id,
      case when jsonb_typeof(s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar')) = 'object'
        then s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar') end as car_setup
  ) saved_car on true
  where p.id = p_player_id;
$$;

create or replace function public.follow_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null then raise exception 'Sign in to follow players.'; end if;
  if p_player_id is null or p_player_id = current_player then
    raise exception 'You cannot follow yourself.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_player_id) then
    raise exception 'Player not found.';
  end if;
  insert into public.profile_follows (follower_id, following_id)
  values (current_player, p_player_id)
  on conflict (follower_id, following_id) do nothing;
end;
$$;

create or replace function public.unfollow_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null then raise exception 'Sign in to unfollow players.'; end if;
  delete from public.profile_follows
  where follower_id = current_player and following_id = p_player_id;
end;
$$;

create or replace function public.send_friend_request(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
  first_player uuid;
  second_player uuid;
  existing_status text;
begin
  if current_player is null then raise exception 'Sign in is required.'; end if;
  if p_player_id is null or p_player_id = current_player then
    raise exception 'Choose another player.';
  end if;
  first_player := least(current_player, p_player_id);
  second_player := greatest(current_player, p_player_id);
  select f.status into existing_status
  from public.friendships f
  where f.user_a = first_player and f.user_b = second_player;
  if existing_status = 'accepted' then raise exception 'You are already friends.'; end if;
  if existing_status = 'pending' then raise exception 'A friend request is already pending.'; end if;

  insert into public.friendships (user_a, user_b, requested_by, status)
  values (first_player, second_player, current_player, 'pending');
end;
$$;

drop function if exists public.list_friendships();

create function public.list_friendships()
returns table(
  player_id uuid,
  display_name text,
  player_tag text,
  avatar text,
  car_id text,
  car_setup jsonb,
  relationship_status text,
  incoming boolean
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.player_tag, p.avatar,
    saved_car.car_id, saved_car.car_setup, f.status,
    (f.status = 'pending' and f.requested_by <> auth.uid())
  from public.friendships f
  join public.profiles p on p.id =
    case when f.user_a = auth.uid() then f.user_b else f.user_a end
  left join public.player_saves s on s.user_id = p.id
  left join lateral (
    select case when s.save_data ->> 'selectedCar'
      in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
      then s.save_data ->> 'selectedCar' end as car_id,
      case when jsonb_typeof(s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar')) = 'object'
        then s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar') end as car_setup
  ) saved_car on true
  where auth.uid() is not null
    and (f.user_a = auth.uid() or f.user_b = auth.uid())
  order by f.status, p.display_name;
$$;

create or replace function public.respond_friend_request(p_player_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
  first_player uuid;
  second_player uuid;
begin
  if current_player is null then raise exception 'Sign in is required.'; end if;
  first_player := least(current_player, p_player_id);
  second_player := greatest(current_player, p_player_id);

  if p_accept then
    update public.friendships
    set status = 'accepted'
    where user_a = first_player and user_b = second_player
      and status = 'pending' and requested_by = p_player_id;
    if not found then raise exception 'That incoming request is no longer available.'; end if;
  else
    delete from public.friendships
    where user_a = first_player and user_b = second_player
      and status = 'pending' and requested_by = p_player_id;
    if not found then raise exception 'That incoming request is no longer available.'; end if;
  end if;
end;
$$;

create or replace function public.remove_friend(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null then raise exception 'Sign in is required.'; end if;
  delete from public.friendships
  where user_a = least(current_player, p_player_id)
    and user_b = greatest(current_player, p_player_id)
    and status = 'accepted';
  if not found then raise exception 'Friend not found.'; end if;
end;
$$;

create or replace function public.record_time_attack(p_track_id text, p_time_ms integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null then raise exception 'Sign in is required.'; end if;
  if p_track_id not in ('circuit', 'tech', 'flow', 'dock')
    or p_time_ms < 1 or p_time_ms > 86400000 then
    raise exception 'Invalid time attack result.';
  end if;
  insert into public.time_attack_records (user_id, track_id, time_ms)
  values (current_player, p_track_id, p_time_ms)
  on conflict (user_id, track_id) do update
  set time_ms = least(public.time_attack_records.time_ms, excluded.time_ms),
      updated_at = case
        when excluded.time_ms < public.time_attack_records.time_ms then now()
        else public.time_attack_records.updated_at
      end;
end;
$$;

create or replace function public.record_time_attack_car(
  p_track_id text,
  p_time_ms integer,
  p_car_id text,
  p_car_setup jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null then raise exception 'Sign in is required.'; end if;
  if p_track_id is null or p_track_id not in ('circuit', 'tech', 'flow', 'dock')
    or p_time_ms is null or p_time_ms < 1 or p_time_ms > 86400000
    or p_car_id is null or p_car_id not in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
    or p_car_setup is null or jsonb_typeof(p_car_setup) <> 'object'
    or length(p_car_setup::text) > 2048
    or p_car_setup ->> 'color' is null
    or p_car_setup ->> 'color' not in ('factory', 'blue', 'red', 'ivory', 'yellow', 'jade', 'purple')
    or p_car_setup ->> 'paint' is null
    or p_car_setup ->> 'paint' not in ('factory', 'stripes', 'two-tone', 'panda')
    or p_car_setup ->> 'wing' is null
    or p_car_setup ->> 'wing' not in ('stock', 'gt', 'ducktail', 'none')
    or p_car_setup ->> 'wheels' is null
    or p_car_setup ->> 'wheels' not in ('steel', 'bronze', 'white', 'gunmetal', 'gold') then
    raise exception 'Invalid time attack result.';
  end if;
  insert into public.time_attack_records (user_id, track_id, time_ms, car_id, car_setup)
  values (current_player, p_track_id, p_time_ms, p_car_id, p_car_setup)
  on conflict (user_id, track_id) do update
  set time_ms = excluded.time_ms,
      car_id = excluded.car_id,
      car_setup = excluded.car_setup,
      updated_at = now()
  where excluded.time_ms < public.time_attack_records.time_ms;
end;
$$;

drop function if exists public.get_friend_times(text);

create function public.get_friend_times(p_track_id text)
returns table(
  player_id uuid,
  display_name text,
  avatar text,
  time_ms integer,
  is_self boolean,
  is_dev boolean,
  car_id text,
  car_setup jsonb
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar, r.time_ms, p.id = auth.uid(),
    p.player_tag = 'CAYBZ#F66865D2F18B', saved_car.car_id, saved_car.car_setup
  from public.time_attack_records r
  join public.profiles p on p.id = r.user_id
  left join public.player_saves s on s.user_id = p.id
  left join lateral (
    select case when s.save_data ->> 'selectedCar'
      in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
      then s.save_data ->> 'selectedCar' end as car_id,
      case when jsonb_typeof(s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar')) = 'object'
        then s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar') end as car_setup
  ) saved_car on true
  where r.track_id = p_track_id
    and p_track_id in ('circuit', 'tech', 'flow', 'dock')
    and (
      p.id = auth.uid()
      or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.user_a = auth.uid() and f.user_b = p.id)
            or (f.user_b = auth.uid() and f.user_a = p.id))
      )
    )
  order by r.time_ms, p.display_name
  limit 10;
$$;

drop function if exists public.get_time_attack_leaderboard(text);

create function public.get_time_attack_leaderboard(p_track_id text)
returns table(
  player_id uuid,
  display_name text,
  avatar text,
  time_ms integer,
  car_id text,
  car_setup jsonb,
  is_dev boolean,
  profile_car_id text,
  profile_car_setup jsonb
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar,
    r.time_ms, r.car_id, r.car_setup,
    p.player_tag = 'CAYBZ#F66865D2F18B',
    saved_car.car_id, saved_car.car_setup
  from public.time_attack_records r
  join public.profiles p on p.id = r.user_id
  left join public.player_saves s on s.user_id = p.id
  left join lateral (
    select case when s.save_data ->> 'selectedCar'
      in ('skyline', 'supra', 'porsche', 'rx7', 'silvia', 'ae86')
      then s.save_data ->> 'selectedCar' end as car_id,
      case when jsonb_typeof(s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar')) = 'object'
        then s.save_data -> 'garage' -> (s.save_data ->> 'selectedCar') end as car_setup
  ) saved_car on true
  where p_track_id in ('circuit', 'tech', 'flow', 'dock')
    and r.track_id = p_track_id
  order by r.time_ms, p.display_name
  limit 10;
$$;

revoke all on function public.search_players(text) from public;
revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.follow_player(uuid) from public;
revoke all on function public.unfollow_player(uuid) from public;
revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.list_friendships() from public;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.record_time_attack(text, integer) from public;
revoke all on function public.record_time_attack_car(text, integer, text, jsonb) from public;
revoke all on function public.get_friend_times(text) from public;
revoke all on function public.get_time_attack_leaderboard(text) from public;
grant execute on function public.search_players(text) to authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.follow_player(uuid) to authenticated;
grant execute on function public.unfollow_player(uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.list_friendships() to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.record_time_attack(text, integer) to authenticated;
grant execute on function public.record_time_attack_car(text, integer, text, jsonb) to authenticated;
grant execute on function public.get_friend_times(text) to authenticated;
grant execute on function public.get_time_attack_leaderboard(text) to anon, authenticated;
