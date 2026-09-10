import { parseTable, type TableWire } from "@/lib/chess/net";

export type Envelope = {
  id: string;
  from: string;
  payload: unknown;
  at: number;
};

export type PeerRow = { id: string; name: string };

const NTFY = "https://ntfy.sh";
export const PEER_TTL_MS = 5 * 60_000;

export function mailboxTopic(room: string) {
  return `sanctum-chess-${room.toLowerCase()}`;
}

export function plyOfFen(fen: string): number {
  const parts = fen.split(" ");
  const full = Number.parseInt(parts[5] ?? "1", 10) || 1;
  const black = parts[1] === "b";
  return (full - 1) * 2 + (black ? 1 : 0);
}

export function payloadKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { t?: string; fen?: string; from?: string; to?: string };
  if (p.t === "move" && p.fen) return `move:${p.fen}`;
  if (p.t === "sync" && p.fen) return `sync:${p.fen}`;
  if (p.t === "state" || p.t === "have" || p.t === "hello") return null;
  if (p.t === "hello") return null;
  return JSON.stringify(payload);
}

type NtfyMsg = { id?: string; time?: number; event?: string; message?: string };

export function parseMailboxBody(text: string): Envelope[] {
  const out: Envelope[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row: NtfyMsg;
    try {
      row = JSON.parse(line) as NtfyMsg;
    } catch {
      continue;
    }
    if (row.event && row.event !== "message") continue;
    if (!row.message) continue;
    try {
      const inner = JSON.parse(row.message) as { from?: string; payload?: unknown };
      if (!inner.from) continue;
      out.push({
        id: String(row.id ?? `t${row.time}`),
        from: String(inner.from).slice(0, 64),
        payload: inner.payload,
        at: (row.time ?? 0) * 1000,
      });
    } catch {
      continue;
    }
  }
  return out;
}

export async function readMailbox(
  room: string,
  peer = "poller",
  name = "",
): Promise<{
  envs: Envelope[];
  peers: PeerRow[];
  table?: TableWire;
}> {
  const params = new URLSearchParams({ room, peer, name, since: "0" });
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(`/api/rtc?${params}`, { signal: ac.signal });
  } finally {
    clearTimeout(kill);
  }
  if (!res.ok) throw new Error(`mailbox poll ${res.status}`);
  const body = (await res.json()) as {
    messages?: { id: string; from: string; payload: unknown }[];
    peers?: PeerRow[];
    table?: TableWire;
  };
  return {
    envs: (body.messages ?? []).map((m) => ({
      id: m.id,
      from: m.from,
      payload: m.payload,
      at: Date.now(),
    })),
    peers: body.peers ?? [],
    table: body.table,
  };
}

export async function publishMailbox(room: string, from: string, payload: unknown): Promise<void> {
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 8000);
  let res: Response;
  try {
    res = await fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "pub", room, from, payload }),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(kill);
  }
  if (!res.ok) throw new Error(`mailbox publish ${res.status}`);
}

export function peersFrom(envs: Envelope[], self: string, now = Date.now()): PeerRow[] {
  const latest = new Map<string, { name: string; at: number }>();
  for (const env of envs) {
    if (env.from === self) continue;
    const p = env.payload;
    const named =
      p && typeof p === "object" && typeof (p as { name?: string }).name === "string"
        ? (p as { name: string }).name
        : env.from;
    const at = env.at && env.at > 1_000_000_000_000 ? env.at : now;
    const prev = latest.get(env.from);
    if (!prev || at >= prev.at) latest.set(env.from, { name: named, at });
  }
  return [...latest.entries()]
    .filter(([, v]) => now - v.at < PEER_TTL_MS)
    .map(([id, v]) => ({ id, name: v.name }))
    .slice(0, 8);
}

export function tableFrom(envs: Envelope[]): TableWire | undefined {
  let latest: TableWire | undefined;
  for (let i = envs.length - 1; i >= 0; i--) {
    const p = envs[i].payload;
    if (!p || typeof p !== "object") continue;
    const t = p as {
      t?: string;
      w?: string;
      b?: string;
      board?: string;
      wFaction?: string;
      bFaction?: string;
      boardId?: string;
    };
    let parsed: TableWire | null = null;
    if (t.t === "table" || t.t === "hello") parsed = parseTable(t);
    else if (t.t === "sync" || t.t === "state") {
      parsed = parseTable({ w: t.wFaction, b: t.bFaction, board: t.boardId });
    }
    if (!parsed) continue;
    if (parsed.b) return parsed;
    if (!latest) latest = parsed;
  }
  return latest;
}

export async function sendWithRetry(room: string, from: string, payload: unknown, tries = 3) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      await publishMailbox(room, from, payload);
      return;
    } catch (err) {
      last = err;
      // Back off hard — ntfy.sh 429s when we hammer it.
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error("mailbox send failed");
}
