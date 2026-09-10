/**
 * Client helpers for /api/room — Postgres turn transport (primary).
 * Room code is the capability; no session required.
 */

export type RoomStateWire = {
  room: string;
  fen: string;
  ply: number;
  from: string | null;
  to: string | null;
  wFaction: string | null;
  bFaction: string | null;
  board: string | null;
  clocks: { w: number; b: number } | null;
  ackPly: number;
  updatedAt: string;
};

async function postRoom<T>(body: Record<string, unknown>): Promise<T> {
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch("/api/room", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`room ${body.op ?? "op"} ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(kill);
  }
}

export async function pushRoomState(input: {
  room: string;
  fen: string;
  ply: number;
  from?: string;
  to?: string;
  wFaction?: string;
  bFaction?: string;
  board?: string;
  clocks?: { w: number; b: number };
}): Promise<RoomStateWire> {
  const body = await postRoom<{ ok: boolean; state: RoomStateWire }>({
    op: "push",
    room: input.room,
    fen: input.fen,
    ply: input.ply,
    from: input.from,
    to: input.to,
    wFaction: input.wFaction,
    bFaction: input.bFaction,
    board: input.board,
    clocks: input.clocks,
  });
  return body.state;
}

export async function pullRoomState(room: string): Promise<RoomStateWire | null> {
  const body = await postRoom<{ ok: boolean; state: RoomStateWire | null }>({
    op: "pull",
    room,
  });
  return body.state ?? null;
}

export async function ackRoomState(room: string, ply: number): Promise<RoomStateWire | null> {
  const body = await postRoom<{ ok: boolean; state: RoomStateWire | null }>({
    op: "ack",
    room,
    ply,
  });
  return body.state ?? null;
}