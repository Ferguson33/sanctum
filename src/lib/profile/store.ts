import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { hashPin, verifyPin } from "./pin";
import type { MatchRow, Profile, Standing } from "./types";

export type { MatchRow, Profile, Standing } from "./types";

type ProfileRow = {
  id: string;
  display_name: string;
  crest_faction: string;
  crest_piece: string;
  created_at?: string | Date;
  updated_at?: string | Date;
  pin_hash?: string;
};

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    crestFaction: row.crest_faction,
    crestPiece: row.crest_piece,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function createProfile(input: {
  name: string;
  pin: string;
  crestFaction: string;
  crestPiece: string;
}): Promise<Profile> {
  const sql = await getSql();
  const displayName = input.name.trim();
  const key = nameKey(displayName);
  const existing = await sql.query<{ id: string }>(
    "select id from sanctum.profiles where display_name_key = $1 limit 1",
    [key],
  );
  if (existing.length) {
    throw Object.assign(new Error("That name is already claimed"), { code: "NAME_TAKEN" });
  }
  const id = randomUUID();
  const pin_hash = await hashPin(input.pin);
  const rows = await sql.query<ProfileRow>(
    `insert into sanctum.profiles (id, display_name, display_name_key, pin_hash, crest_faction, crest_piece)
     values ($1, $2, $3, $4, $5, $6)
     returning id, display_name, crest_faction, crest_piece, created_at, updated_at`,
    [id, displayName, key, pin_hash, input.crestFaction, input.crestPiece],
  );
  return toProfile(rows[0]);
}

export async function findByName(name: string): Promise<(Profile & { pinHash: string }) | null> {
  const sql = await getSql();
  const rows = await sql.query<ProfileRow>(
    `select id, display_name, crest_faction, crest_piece, pin_hash, created_at, updated_at
     from sanctum.profiles where display_name_key = $1 limit 1`,
    [nameKey(name)],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return { ...toProfile(row), pinHash: row.pin_hash ?? "" };
}

export async function verifyProfilePin(name: string, pin: string): Promise<Profile | null> {
  const found = await findByName(name);
  if (!found) return null;
  const ok = await verifyPin(pin, found.pinHash);
  if (!ok) return null;
  const { pinHash: _, ...profile } = found;
  return profile;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const sql = await getSql();
  const rows = await sql.query<ProfileRow>(
    `select id, display_name, crest_faction, crest_piece, created_at, updated_at
     from sanctum.profiles where id = $1 limit 1`,
    [id],
  );
  return rows.length ? toProfile(rows[0]) : null;
}

export async function listStandings(): Promise<Standing[]> {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    display_name: string;
    crest_faction: string;
    crest_piece: string;
    wins: number;
    losses: number;
  }>(
    `select p.id, p.display_name, p.crest_faction, p.crest_piece,
            coalesce(w.wins, 0)::int as wins,
            coalesce(l.losses, 0)::int as losses
     from sanctum.profiles p
     left join (
       select winner_id as id, count(*)::int as wins from sanctum.matches group by winner_id
     ) w on w.id = p.id
     left join (
       select loser_id as id, count(*)::int as losses from sanctum.matches group by loser_id
     ) l on l.id = p.id
     order by coalesce(w.wins, 0) desc, coalesce(l.losses, 0) asc, p.display_name asc`,
  );
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    crestFaction: r.crest_faction,
    crestPiece: r.crest_piece,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
  }));
}

export async function h2h(
  a: string,
  b: string,
): Promise<{ you: number; them: number; recent: MatchRow[] }> {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    winner_id: string;
    loser_id: string;
    w_faction: string;
    b_faction: string;
    room: string | null;
    ended_at: string | Date;
  }>(
    `select id, winner_id, loser_id, w_faction, b_faction, room, ended_at
     from sanctum.matches
     where (winner_id = $1 and loser_id = $2) or (winner_id = $2 and loser_id = $1)
     order by ended_at desc
     limit 20`,
    [a, b],
  );
  let you = 0;
  let them = 0;
  const recent: MatchRow[] = rows.map((r) => {
    if (r.winner_id === a) you += 1;
    else them += 1;
    return {
      id: r.id,
      winnerId: r.winner_id,
      loserId: r.loser_id,
      wFaction: r.w_faction,
      bFaction: r.b_faction,
      room: r.room,
      endedAt: String(r.ended_at),
    };
  });
  return { you, them, recent };
}

/** Insert a decisive match. Idempotent when `room` is set (partial unique index). */
export async function recordMatch(input: {
  winnerId: string;
  loserId: string;
  wFaction: string;
  bFaction: string;
  room?: string | null;
}): Promise<{ ok: true; id: string; duplicate?: boolean } | { ok: false; error: string }> {
  if (input.winnerId === input.loserId) {
    return { ok: false, error: "winner and loser must differ" };
  }
  const sql = await getSql();
  const winner = await getProfile(input.winnerId);
  const loser = await getProfile(input.loserId);
  if (!winner || !loser) return { ok: false, error: "unknown player" };

  const room = input.room?.trim() || null;
  if (room) {
    const existing = await sql.query<{ id: string }>(
      "select id from sanctum.matches where room = $1 limit 1",
      [room],
    );
    if (existing.length) return { ok: true, id: existing[0].id, duplicate: true };
  }

  const id = randomUUID();
  try {
    await sql.query(
      `insert into sanctum.matches (id, winner_id, loser_id, w_faction, b_faction, room)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, input.winnerId, input.loserId, input.wFaction, input.bFaction, room],
    );
  } catch (err) {
    // Race on room unique index — treat as idempotent success.
    if (room) {
      const again = await sql.query<{ id: string }>(
        "select id from sanctum.matches where room = $1 limit 1",
        [room],
      );
      if (again.length) return { ok: true, id: again[0].id, duplicate: true };
    }
    throw err;
  }
  return { ok: true, id };
}
