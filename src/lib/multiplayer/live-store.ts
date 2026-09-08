import { getSql } from "@/lib/db";
import { plyOfFen } from "./mailbox";
import type { Envelope } from "./mailbox";

const KEEP = new Set(["state", "table", "sync", "resign", "theme", "move"]);

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function plyOf(payload: unknown): number {
  const p = asRecord(payload);
  if (!p) return 0;
  if (typeof p.ply === "number" && Number.isFinite(p.ply)) return Math.max(0, Math.floor(p.ply));
  if (typeof p.fen === "string") return plyOfFen(p.fen);
  return 0;
}

export async function writeLive(room: string, from: string, payload: unknown): Promise<void> {
  const p = asRecord(payload);
  const t = typeof p?.t === "string" ? p.t : "";
  if (!KEEP.has(t)) return;
  const code = room.trim().toUpperCase();
  if (!code) return;
  const ply = plyOf(payload);
  // Never let an empty white-only table replace a seated/moved board.
  if (t === "table" && !p?.b && ply <= 0) {
    const sql = await getSql();
    const existing = await sql.query<{ ply: number; payload: unknown }>(
      "select ply, payload from sanctum.live where room = $1 limit 1",
      [code],
    );
    if (existing[0] && (Number(existing[0].ply) > 0 || asRecord(existing[0].payload)?.b)) return;
  }
  const sql = await getSql();
  await sql.query(
    `insert into sanctum.live (room, from_id, payload, ply, updated_at)
     values ($1, $2, $3::jsonb, $4, now())
     on conflict (room) do update set
       from_id = excluded.from_id,
       payload = case when sanctum.live.ply > excluded.ply then sanctum.live.payload else excluded.payload end,
       ply = greatest(sanctum.live.ply, excluded.ply),
       updated_at = now()`,
    [code, from.slice(0, 64), JSON.stringify(payload), ply],
  );
}

export async function readLive(room: string): Promise<Envelope | null> {
  const code = room.trim().toUpperCase();
  if (!code) return null;
  try {
    const sql = await getSql();
    const rows = await sql.query<{ from_id: string; payload: unknown; ply: number; updated_at: string | Date }>(
      "select from_id, payload, ply, updated_at from sanctum.live where room = $1 limit 1",
      [code],
    );
    if (!rows.length) return null;
    const row = rows[0];
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const t = asRecord(payload)?.t ?? "state";
    return {
      id: `live-${t}-${Number(row.ply) || 0}`,
      from: row.from_id,
      payload,
      at: new Date(row.updated_at).getTime() || Date.now(),
    };
  } catch {
    return null;
  }
}
