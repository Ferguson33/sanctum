-- Live vs later seat challenges. Clock only belongs on live (both at the table).
create schema if not exists sanctum;

alter table if exists sanctum.games
  add column if not exists challenge text;

alter table if exists sanctum.games
  add column if not exists expires_at timestamptz;

