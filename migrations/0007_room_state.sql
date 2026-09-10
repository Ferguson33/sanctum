-- Shared turn state so End turn survives ntfy.sh hangs/429s.
-- Room code is the capability (family app) — same trust as the mailbox topic.
-- Schema sanctum only — CREATE IF NOT EXISTS, never DROP/TRUNCATE.
create schema if not exists sanctum;

create table if not exists sanctum.room_state (
  room text primary key,
  fen text not null,
  ply int not null default 0,
  from_sq text,
  to_sq text,
  w_faction text,
  b_faction text,
  board text,
  clocks jsonb,
  ack_ply int not null default -1,
  updated_at timestamptz not null default now()
);