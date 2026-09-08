-- In-progress online duels for slow / multi-duel "My games" reopen.
-- Schema sanctum only — CREATE IF NOT EXISTS, never DROP/TRUNCATE.
create schema if not exists sanctum;

create table if not exists sanctum.games (
  id text primary key,
  room text not null,
  fen text not null,
  ply int not null default 0,
  w_faction text not null,
  b_faction text not null default '',
  board text not null,
  clock_limit_sec int,
  clock_w_ms int,
  clock_b_ms int,
  white_profile_id text references sanctum.profiles(id),
  black_profile_id text references sanctum.profiles(id),
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_status_chk check (status in ('open', 'finished'))
);

create unique index if not exists games_room_uidx on sanctum.games (room);
create index if not exists games_white_open_idx
  on sanctum.games (white_profile_id) where status = 'open' and white_profile_id is not null;
create index if not exists games_black_open_idx
  on sanctum.games (black_profile_id) where status = 'open' and black_profile_id is not null;
create index if not exists games_updated_idx on sanctum.games (updated_at desc);
