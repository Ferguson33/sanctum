import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ackRoomState,
  pullRoomState,
  pushRoomState,
  serializeRoomState,
} from "@/lib/multiplayer/room-state.server";

const ROOM = z.string().min(4).max(32);

const pushSchema = z.object({
  op: z.literal("push"),
  room: ROOM,
  fen: z.string().min(10).max(128),
  ply: z.number().int().min(0).max(600),
  from: z.string().min(2).max(8).optional(),
  to: z.string().min(2).max(8).optional(),
  wFaction: z.string().min(1).max(64).optional(),
  bFaction: z.string().max(64).optional(),
  board: z.string().min(1).max(64).optional(),
  clocks: z
    .object({
      w: z.number().int().min(0).max(3_600_000),
      b: z.number().int().min(0).max(3_600_000),
    })
    .optional(),
});

const pullSchema = z.object({
  op: z.literal("pull"),
  room: ROOM,
});

const ackSchema = z.object({
  op: z.literal("ack"),
  room: ROOM,
  ply: z.number().int().min(0).max(600),
});

const postSchema = z.discriminatedUnion("op", [pushSchema, pullSchema, ackSchema]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
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
  if (!parsed.success) {
    return json({ error: "invalid request", details: parsed.error.flatten() }, 400);
  }
  const msg = parsed.data;

  if (msg.op === "push") {
    const row = await pushRoomState({
      room: msg.room,
      fen: msg.fen,
      ply: msg.ply,
      from: msg.from,
      to: msg.to,
      wFaction: msg.wFaction,
      bFaction: msg.bFaction,
      board: msg.board,
      clocks: msg.clocks,
    });
    return json({ ok: true, state: serializeRoomState(row) });
  }

  if (msg.op === "pull") {
    const row = await pullRoomState(msg.room);
    return json({ ok: true, state: row ? serializeRoomState(row) : null });
  }

  if (msg.op === "ack") {
    const row = await ackRoomState(msg.room, msg.ply);
    return json({ ok: true, state: row ? serializeRoomState(row) : null });
  }

  return json({ error: "unknown op" }, 400);
}

async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  if (room.length < 4) return json({ error: "room required" }, 400);
  const row = await pullRoomState(room);
  return json({ ok: true, state: row ? serializeRoomState(row) : null });
}

async function handle(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(request);
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[room] error:", error);
    return json({ error: "room failed" }, 500);
  }
}

export const Route = createFileRoute("/api/room")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});