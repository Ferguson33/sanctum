import { getSql } from "@/lib/db";

export type RoomStateRow = {
  room: string;
  fen: string;
  ply: number;
  from_sq: string | null;
  to_sq: string | null;
  w_faction: string | null;
  b_faction: string | null;
  board: string | null;
  clocks: unknown;
  ack_ply: number;
  updated_at: string | Date;
};

function codeOf(room: string): string {
  return room.trim().toUpperCase();
}

function asClocks(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
}

export async function pushRoomState(input: {
  room: string;
  fen: string;
  ply: number;
  from?: string | null;
  to?: string | null;
  wFaction?: string | null;
  bFaction?: string | null;
  board?: string | null;
  clocks?: unknown;
}): Promise<RoomStateRow> {
  const room = codeOf(input.room);
  const ply = Math.max(0, Math.floor(input.ply));
  const fen = input.fen.slice(0, 128);
  const fromSq = input.from?.slice(0, 8) ?? null;
  const toSq = input.to?.slice(0, 8) ?? null;
  const wFaction = input.wFaction?.slice(0, 64) ?? null;
  const bFaction = input.bFaction?.slice(0, 64) ?? null;
  const board = input.board?.slice(0, 64) ?? null;
  const clocksJson = input.clocks == null ? null : JSON.stringify(input.clocks);

  const sql = await getSql();
  const rows = await sql.query<RoomStateRow>(
    `insert into sanctum.room_state as rs
       (room, fen, ply, from_sq, to_sq, w_faction, b_faction, board, clocks, ack_ply, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, -1, now())
     on conflict (room) do update set
       fen = case when excluded.ply >= rs.ply then excluded.fen else rs.fen end,
       from_sq = case when excluded.ply >= rs.ply then excluded.from_sq else rs.from_sq end,
       to_sq = case when excluded.ply >= rs.ply then excluded.to_sq else rs.to_sq end,
       w_faction = coalesce(excluded.w_faction, rs.w_faction),
       b_faction = coalesce(excluded.b_faction, rs.b_faction),
       board = coalesce(excluded.board, rs.board),
       clocks = case
         when excluded.ply >= rs.ply and excluded.clocks is not null then excluded.clocks
         else rs.clocks
       end,
       -- Never reset ack_ply on same-ply resend; leave it when ply advances until peer acks.
       ply = greatest(rs.ply, excluded.ply),
       ack_ply = case
         when excluded.ply = rs.ply then rs.ack_ply
         when excluded.ply > rs.ply then rs.ack_ply
         else rs.ack_ply
       end,
       updated_at = case when excluded.ply >= rs.ply then now() else rs.updated_at end
     returning room, fen, ply, from_sq, to_sq, w_faction, b_faction, board, clocks, ack_ply, updated_at`,
    [room, fen, ply, fromSq, toSq, wFaction, bFaction, board, clocksJson],
  );
  const row = rows[0];
  if (!row) throw new Error("room push failed");
  return { ...row, clocks: asClocks(row.clocks) };
}

export async function pullRoomState(roomRaw: string): Promise<RoomStateRow | null> {
  const room = codeOf(roomRaw);
  if (!room) return null;
  try {
    const sql = await getSql();
    const rows = await sql.query<RoomStateRow>(
      `select room, fen, ply, from_sq, to_sq, w_faction, b_faction, board, clocks, ack_ply, updated_at
       from sanctum.room_state where room = $1 limit 1`,
      [room],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return { ...row, clocks: asClocks(row.clocks) };
  } catch {
    return null;
  }
}

export async function ackRoomState(roomRaw: string, plyRaw: number): Promise<RoomStateRow | null> {
  const room = codeOf(roomRaw);
  const ply = Math.max(0, Math.floor(plyRaw));
  if (!room) return null;
  const sql = await getSql();
  const rows = await sql.query<RoomStateRow>(
    `update sanctum.room_state
     set ack_ply = greatest(ack_ply, $2),
         updated_at = now()
     where room = $1
     returning room, fen, ply, from_sq, to_sq, w_faction, b_faction, board, clocks, ack_ply, updated_at`,
    [room, ply],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return { ...row, clocks: asClocks(row.clocks) };
}

export function serializeRoomState(row: RoomStateRow) {
  return {
    room: row.room,
    fen: row.fen,
    ply: Number(row.ply) || 0,
    from: row.from_sq,
    to: row.to_sq,
    wFaction: row.w_faction,
    bFaction: row.b_faction,
    board: row.board,
    clocks: asClocks(row.clocks),
    ackPly: Number(row.ack_ply),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}