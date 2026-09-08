create schema if not exists sanctum;

create table if not exists sanctum.profiles (
  id text primary key,
  display_name text not null,
  display_name_key text not null unique,
  pin_hash text not null,
  crest_faction text not null,
  crest_piece text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sanctum.matches (
  id text primary key,
  winner_id text not null references sanctum.profiles(id),
  loser_id text not null references sanctum.profiles(id),
  w_faction text not null,
  b_faction text not null,
  room text,
  ended_at timestamptz not null default now()
);

create unique index if not exists matches_room_uidx on sanctum.matches (room) where room is not null;
create index if not exists matches_winner_idx on sanctum.matches (winner_id);
create index if not exists matches_loser_idx on sanctum.matches (loser_id);
