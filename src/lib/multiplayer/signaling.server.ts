/**
 * Turn-based room mailbox. Production has no Postgres, so we never touch
 * PGLite there — phones meet on a shared HTTP topic (ntfy), with an in-process
 * log as the preview fallback.
 */
import { z } from "zod";
import { parseTable, type TableWire } from "@/lib/chess/net";
import type { PeerRow } from "./p2p";
import { readLive, writeLive } from "./live-store";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const pubSchema = z.object({
  op: z.literal("pub"),
  room: ID,
  from: ID,
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 8_192, {
    message: "payload too large",
  }),
});
const leaveSchema = z.object({ op: z.literal("leave"), room: ID, peer: ID });
const tableSchema = z.object({
  op: z.literal("table"),
  room: ID,
  w: z.string().max(32),
  b: z.string().max(32),
  board: z.string().max(32),
});
const postSchema = z.discriminatedUnion("op", [pubSchema, leaveSchema, tableSchema]);
const PEER_TTL_MS = 5 * 60_000;

function peersFrom(envs: Envelope[], self: string): PeerRow[] {
  const latest = new Map<string, { name: string; at: number }>();
  const now = Date.now();
  for (const env of envs) {
    if (env.from === self || env.from === "table") continue;
    const p = env.payload;
    const name =
      p && typeof p === "object" && typeof (p as { name?: string }).name === "string"
        ? (p as { name: string }).name
        : env.from;
    const at = env.at && env.at > 1_000_000_000_000 ? env.at : now;
    const prev = latest.get(env.from);
    if (!prev || at >= prev.at) latest.set(env.from, { name, at });
  }
  return [...latest.entries()]
    .filter(([, v]) => now - v.at < PEER_TTL_MS)
    .map(([id, v]) => ({ id, name: v.name }))
    .slice(0, 8);
}
const NTFY = "https://ntfy.sh";

type Envelope = {
  id: string;
  from: string;
  payload: unknown;
  at: number;
};

type Store = {
  seq: number;
  rooms: Map<string, Envelope[]>;
};

const globalRef = globalThis as typeof globalThis & {
  __sanctumBus__?: Store;
  __sanctumRemote__?: Map<string, Envelope[]>;
};

function store(): Store {
  globalRef.__sanctumBus__ ??= { seq: 1, rooms: new Map() };
  return globalRef.__sanctumBus__;
}

function remoteCache(): Map<string, Envelope[]> {
  globalRef.__sanctumRemote__ ??= new Map();
  return globalRef.__sanctumRemote__;
}

function topic(room: string) {
  return `sanctum-chess-${room.toLowerCase()}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function appendLocal(room: string, from: string, payload: unknown): Envelope {
  const s = store();
  const env: Envelope = { id: `m${s.seq++}`, from, payload, at: Date.now() };
  const list = s.rooms.get(room) ?? [];
  list.push(env);
  s.rooms.set(room, list.slice(-80));
  return env;
}

async function publishRemote(room: string, from: string, payload: unknown) {
  const body = JSON.stringify({ from, payload });
  const res = await fetch(`${NTFY}/${topic(room)}`, {
    method: "POST",
    headers: { "content-type": "text/plain", Title: "sanctum" },
    body,
  });
  if (!res.ok) throw new Error(`mailbox publish ${res.status}`);
}

type NtfyMsg = { id?: string; time?: number; event?: string; message?: string };

async function readRemote(room: string): Promise<Envelope[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${NTFY}/${topic(room)}/json?poll=1`, {
        headers: { accept: "application/x-ndjson, application/json" },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        lastErr = new Error("mailbox poll 429");
        continue;
      }
      if (!res.ok) throw new Error(`mailbox poll ${res.status}`);
      const text = await res.text();
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
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("mailbox poll failed");
}

function tableFrom(envs: Envelope[]): TableWire | undefined {
  let latest: TableWire | undefined;
  for (let i = envs.length - 1; i >= 0; i--) {
    const p = envs[i].payload;
    if (!p || typeof p !== "object") continue;
    const t = p as { t?: string; w?: string; b?: string; board?: string; table?: TableWire };
    let parsed: TableWire | null = null;
    if (t.t === "table") parsed = parseTable(t);
    else if (t.t === "hello" && t.w && t.b && t.board) parsed = parseTable(t);
    else if (t.t === "sync" || t.t === "state") {
      parsed = parseTable({
        w: (t as { wFaction?: string }).wFaction,
        b: (t as { bFaction?: string }).bFaction,
        board: (t as { boardId?: string }).boardId,
      });
    }
    if (!parsed) continue;
    if (parsed.b) return parsed;
    if (!latest) latest = parsed;
  }
  return latest;
}

async function loadRoom(room: string): Promise<Envelope[]> {
  const cache = remoteCache();
  try {
    const remote = await readRemote(room);
    if (remote.length) {
      cache.set(room, remote);
      return remote;
    }
    const hit = cache.get(room);
    if (hit?.length) return hit;
  } catch (err) {
    console.warn("[rtc] remote mailbox missed, using last good / local log", err);
    const hit = cache.get(room);
    if (hit?.length) return hit;
  }
  return store().rooms.get(room) ?? [];
}

async function handleGet(url: URL): Promise<Response> {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(64).default(""),
      since: z.string().max(64).default("0"),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? "0",
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, since } = parsed.data;
  let envs: Envelope[] = [];
  try {
    envs = await loadRoom(room);
  } catch (err) {
    console.warn("[rtc] mailbox poll missed", err);
    envs = remoteCache().get(room) ?? store().rooms.get(room) ?? [];
  }
  const live = await readLive(room);
  if (live && !envs.some((e) => e.id === live.id)) {
    envs = [...envs, live];
  }
  const seen = new Set<string>();
  const messages: Envelope[] = [];
  let pass = since === "0" || since === "" || !envs.some((e) => e.id === since);
  for (const env of envs) {
    if (!pass) {
      if (env.id === since) pass = true;
      continue;
    }
    if (seen.has(env.id)) continue;
    seen.add(env.id);
    messages.push(env);
  }
  return json({
    peers: peersFrom(envs, peer),
    messages: messages.map((m) => ({ id: m.id, from: m.from, payload: m.payload })),
    table: tableFrom(envs),
  });
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;

  if (msg.op === "leave") return json({ ok: true });

  const payload =
    msg.op === "table" ? { t: "table", w: msg.w, b: msg.b, board: msg.board } : msg.payload;
  const from = msg.op === "table" ? "table" : msg.from;
  appendLocal(msg.room, from, payload);
  let stored = false;
  try {
    await writeLive(msg.room, from, payload);
    stored = true;
  } catch (err) {
    console.warn("[rtc] live snapshot missed", err);
  }
  try {
    await publishRemote(msg.room, from, payload);
    stored = true;
  } catch (err) {
    console.warn("[rtc] remote publish missed", err);
  }
  if (!stored) return json({ error: "mailbox publish failed", ok: false }, 502);
  return json({ ok: true });
}

export async function handleSignaling(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
