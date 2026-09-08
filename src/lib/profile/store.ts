import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { hashPin, verifyPin } from "./pin";
import type { GameRow, MatchRow, Profile, Standing } from "./types";
import { LIVE_ACCEPT_SEC } from "./types";

export type { GameRow, MatchRow, Profile, Standing } from "./types";
export { LIVE_ACCEPT_SEC } from "./types";

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


type GameDbRow = {
  id: string;
  room: string;
  fen: string;
  ply: number;
  w_faction: string;
  b_faction: string;
  board: string;
  clock_limit_sec: number | null;
  clock_w_ms: number | null;
  clock_b_ms: number | null;
  white_profile_id: string | null;
  black_profile_id: string | null;
  status: string;
  updated_at: string | Date;
  challenge?: string | null;
  expires_at?: string | Date | null;
  white_name?: string | null;
  black_name?: string | null;
};

function toGameRow(row: GameDbRow, profileId?: string): GameRow {
  let mySide: "w" | "b" | undefined;
  if (profileId) {
    if (row.white_profile_id === profileId) mySide = "w";
    else if (row.black_profile_id === profileId) mySide = "b";
  }
  const ch = row.challenge === "live" || row.challenge === "later" ? row.challenge : null;
  return {
    id: row.id,
    room: row.room,
    fen: row.fen,
    ply: Number(row.ply) || 0,
    wFaction: row.w_faction,
    bFaction: row.b_faction ?? "",
    board: row.board,
    clockLimitSec: row.clock_limit_sec == null ? null : Number(row.clock_limit_sec),
    clockWMs: row.clock_w_ms == null ? null : Number(row.clock_w_ms),
    clockBMs: row.clock_b_ms == null ? null : Number(row.clock_b_ms),
    whiteProfileId: row.white_profile_id,
    blackProfileId: row.black_profile_id,
    status: row.status === "finished" ? "finished" : "open",
    updatedAt: String(row.updated_at),
    challenge: ch,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    whiteName: row.white_name ?? null,
    blackName: row.black_name ?? null,
    ...(mySide ? { mySide } : {}),
  };
}

const GAME_SELECT = `id, room, fen, ply, w_faction, b_faction, board,
  clock_limit_sec, clock_w_ms, clock_b_ms,
  white_profile_id, black_profile_id, status, updated_at,
  challenge, expires_at,
  (select display_name from sanctum.profiles p where p.id = white_profile_id) as white_name,
  (select display_name from sanctum.profiles p where p.id = black_profile_id) as black_name`;

/** Open games where the profile sits white or black. */
export async function listMineGames(profileId: string): Promise<GameRow[]> {
  const sql = await getSql();
  await sql.query(
    `update sanctum.games
        set status = 'finished', updated_at = now()
      where status = 'open'
        and challenge = 'live'
        and ply = 0
        and (b_faction is null or b_faction = '')
        and expires_at is not null
        and expires_at < now()
        and (white_profile_id = $1 or black_profile_id = $1)`,
    [profileId],
  );
  const rows = await sql.query<GameDbRow>(
    `select ${GAME_SELECT}
     from sanctum.games
     where status = 'open'
       and (white_profile_id = $1 or black_profile_id = $1)
     order by updated_at desc
     limit 40`,
    [profileId],
  );
  return rows.map((r) => toGameRow(r, profileId));
}

export async function getGameByRoom(
  room: string,
  profileId?: string | null,
): Promise<GameRow | null> {
  const sql = await getSql();
  const code = room.trim().toUpperCase();
  if (!code) return null;
  const rows = await sql.query<GameDbRow>(
    `select ${GAME_SELECT} from sanctum.games where room = $1 limit 1`,
    [code],
  );
  if (!rows.length) return null;
  return toGameRow(rows[0], profileId ?? undefined);
}

export type UpsertGameInput = {
  room: string;
  fen: string;
  ply: number;
  wFaction: string;
  bFaction: string;
  board: string;
  clockLimitSec?: number | null;
  clockWMs?: number | null;
  clockBMs?: number | null;
  /** Host (white) must create the first row when signed in. */
  asHost: boolean;
  /** Peer profile id when known (black if host, white if guest). */
  peerProfileId?: string | null;
  challenge?: "live" | "later" | null;
};

/**
 * Idempotent upsert by room. Creates only when the signed-in host creates the
 * saved row; later either seated profile may update fen/clocks/peer id.
 */
export async function upsertGame(
  profileId: string,
  input: UpsertGameInput,
): Promise<{ ok: true; game: GameRow } | { ok: false; error: string; status?: number }> {
  const room = input.room.trim().toUpperCase();
  if (!room || room.length < 4 || room.length > 32) {
    return { ok: false, error: "invalid room", status: 400 };
  }
  if (!input.fen || !input.wFaction || !input.board) {
    return { ok: false, error: "missing board state", status: 400 };
  }
  const sql = await getSql();
  const existing = await sql.query<GameDbRow>(
    `select ${GAME_SELECT} from sanctum.games where room = $1 limit 1`,
    [room],
  );

  const clockLimit =
    input.clockLimitSec == null || input.clockLimitSec <= 0 ? null : Math.floor(input.clockLimitSec);
  const clockW = input.clockWMs == null ? null : Math.max(0, Math.floor(input.clockWMs));
  const clockB = input.clockBMs == null ? null : Math.max(0, Math.floor(input.clockBMs));
  const ply = Math.max(0, Math.floor(input.ply) || 0);
  const bFaction = input.bFaction || "";
  const peer = input.peerProfileId?.trim() || null;
  const challenge = input.challenge === "live" || input.challenge === "later" ? input.challenge : null;
  const liveClock = challenge === "later" ? null : clockLimit;

  if (!existing.length) {
    // Prefer requiring host profile to create the first saved row.
    if (!input.asHost) {
      return { ok: false, error: "host must start the saved game", status: 403 };
    }
    const id = randomUUID();
    const whiteId = profileId;
    const blackId = peer && peer !== whiteId ? peer : null;
    await sql.query(
      `insert into sanctum.games (
         id, room, fen, ply, w_faction, b_faction, board,
         clock_limit_sec, clock_w_ms, clock_b_ms,
         white_profile_id, black_profile_id, status, updated_at,
         challenge, expires_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10,
         $11, $12, 'open', now(),
         $13, case when $13 = 'live' then now() + ($14::int * interval '1 second') else null end
       )`,
      [
        id,
        room,
        input.fen,
        ply,
        input.wFaction,
        bFaction,
        input.board,
        liveClock,
        challenge === "later" ? null : clockW,
        challenge === "later" ? null : clockB,
        whiteId,
        blackId,
        challenge,
        LIVE_ACCEPT_SEC,
      ],
    );
    const created = await getGameByRoom(room, profileId);
    if (!created) return { ok: false, error: "create failed", status: 500 };
    return { ok: true, game: created };
  }

  const row = existing[0];
  if (row.status === "finished") {
    return { ok: false, error: "game already finished", status: 409 };
  }

  const isWhite = row.white_profile_id === profileId;
  const isBlack = row.black_profile_id === profileId;
  // Allow guest seat to claim black when still open and caller is not white.
  const claimBlack =
    !isWhite &&
    !isBlack &&
    !input.asHost &&
    (row.black_profile_id == null || row.black_profile_id === "");

  if (!isWhite && !isBlack && !claimBlack) {
    return { ok: false, error: "not your game", status: 403 };
  }

  let nextWhite = row.white_profile_id;
  let nextBlack = row.black_profile_id;
  if (claimBlack) nextBlack = profileId;
  if (input.asHost && peer && peer !== nextWhite) {
    if (!nextBlack || nextBlack === peer) nextBlack = peer;
  }
  if (!input.asHost && peer && peer !== nextBlack) {
    if (!nextWhite || nextWhite === peer) nextWhite = peer;
  }

  await sql.query(
    `update sanctum.games set
       fen = $2,
       ply = $3,
       w_faction = $4,
       b_faction = $5,
       board = $6,
       clock_limit_sec = $7,
       clock_w_ms = $8,
       clock_b_ms = $9,
       white_profile_id = $10,
       black_profile_id = $11,
       updated_at = now()
     where room = $1 and status = 'open'`,
    [
      room,
      input.fen,
      ply,
      input.wFaction,
      bFaction || row.b_faction,
      input.board,
      clockLimit,
      clockW,
      clockB,
      nextWhite,
      nextBlack,
    ],
  );
  const updated = await getGameByRoom(room, profileId);
  if (!updated) return { ok: false, error: "update failed", status: 500 };
  return { ok: true, game: updated };
}

/** Mark an open game finished (keeps row for audit; My games lists open only). */
export async function finishGame(
  profileId: string,
  room: string,
): Promise<{ ok: true; game: GameRow } | { ok: false; error: string; status?: number }> {
  const code = room.trim().toUpperCase();
  if (!code) return { ok: false, error: "invalid room", status: 400 };
  const sql = await getSql();
  const rows = await sql.query<GameDbRow>(
    `select ${GAME_SELECT} from sanctum.games where room = $1 limit 1`,
    [code],
  );
  if (!rows.length) return { ok: false, error: "not found", status: 404 };
  const row = rows[0];
  if (row.white_profile_id !== profileId && row.black_profile_id !== profileId) {
    return { ok: false, error: "not your game", status: 403 };
  }
  if (row.status === "finished") {
    return { ok: true, game: toGameRow(row, profileId) };
  }
  await sql.query(
    `update sanctum.games set status = 'finished', updated_at = now() where room = $1`,
    [code],
  );
  const done = await getGameByRoom(code, profileId);
  if (!done) return { ok: false, error: "finish failed", status: 500 };
  return { ok: true, game: done };
}

/** Live pickup missed — keep the row as an untimed later challenge. */
export async function deferGameLater(
  profileId: string,
  room: string,
): Promise<{ ok: true; game: GameRow } | { ok: false; error: string; status?: number }> {
  const code = room.trim().toUpperCase();
  if (!code) return { ok: false, error: "invalid room", status: 400 };
  const sql = await getSql();
  const rows = await sql.query<GameDbRow>(
    `select ${GAME_SELECT} from sanctum.games where room = $1 limit 1`,
    [code],
  );
  if (!rows.length) return { ok: false, error: "not found", status: 404 };
  const row = rows[0];
  if (row.white_profile_id !== profileId && row.black_profile_id !== profileId) {
    return { ok: false, error: "not your game", status: 403 };
  }
  if (row.status === "finished") {
    return { ok: true, game: toGameRow(row, profileId) };
  }
  await sql.query(
    `update sanctum.games
        set challenge = 'later',
            expires_at = null,
            clock_limit_sec = null,
            clock_w_ms = null,
            clock_b_ms = null,
            updated_at = now()
      where room = $1 and status = 'open'`,
    [code],
  );
  const next = await getGameByRoom(code, profileId);
  if (!next) return { ok: false, error: "defer failed", status: 500 };
  return { ok: true, game: next };
}
