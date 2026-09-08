-- Shared live board snapshot so End turn survives ntfy.sh 429s.
-- Room code is the key — no login required (same trust as the mailbox topic).
create schema if not exists sanctum;

create table if not exists sanctum.live (
  room text primary key,
  from_id text not null,
  payload jsonb not null,
  ply int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists live_updated_idx on sanctum.live (updated_at desc);
