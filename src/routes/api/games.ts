import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FACTIONS } from "@/lib/chess/catalog";
import { getSessionProfileId } from "@/lib/profile/session";
import {
  deferGameLater,
  dropGame,
  finishGame,
  getGameByRoom,
  listMineGames,
  upsertGame,
} from "@/lib/profile/store";

const FACTION_IDS = FACTIONS.map((f) => f.id) as [string, ...string[]];

const listMineSchema = z.object({ op: z.literal("listMine") });
const getByRoomSchema = z.object({
  op: z.literal("getByRoom"),
  room: z.string().min(4).max(32),
});
const upsertSchema = z.object({
  op: z.literal("upsert"),
  room: z.string().min(4).max(32),
  fen: z.string().min(10).max(128),
  ply: z.number().int().min(0).max(600),
  wFaction: z.enum(FACTION_IDS),
  bFaction: z.union([z.enum(FACTION_IDS), z.literal("")]).optional().default(""),
  board: z.string().min(1).max(64),
  clockLimitSec: z.number().int().min(0).max(3600).nullable().optional(),
  clockWMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  clockBMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  asHost: z.boolean(),
  peerProfileId: z.string().min(1).max(64).nullable().optional(),
  challenge: z.enum(["live", "later"]).nullable().optional(),
});
const finishSchema = z.object({
  op: z.literal("finish"),
  room: z.string().min(4).max(32),
});
const laterSchema = z.object({
  op: z.literal("later"),
  room: z.string().min(4).max(32),
});
const dropSchema = z.object({
  op: z.literal("drop"),
  room: z.string().min(4).max(32),
});

const postSchema = z.discriminatedUnion("op", [
  listMineSchema,
  getByRoomSchema,
  upsertSchema,
  finishSchema,
  laterSchema,
  dropSchema,
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function requireSession(): Promise<string | Response> {
  const id = await getSessionProfileId();
  if (!id) return json({ error: "Sign in first" }, 401);
  return id;
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

  if (msg.op === "listMine") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const games = await listMineGames(self);
    return json({ games });
  }

  if (msg.op === "getByRoom") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const game = await getGameByRoom(msg.room, self);
    if (!game) return json({ game: null });
    // Only expose open games the caller sits in (or host-created white seat).
    if (
      game.status === "open" &&
      (game.whiteProfileId === self || game.blackProfileId === self)
    ) {
      return json({ game });
    }
    return json({ game: null });
  }

  if (msg.op === "upsert") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const result = await upsertGame(self, {
      room: msg.room,
      fen: msg.fen,
      ply: msg.ply,
      wFaction: msg.wFaction,
      bFaction: msg.bFaction ?? "",
      board: msg.board,
      clockLimitSec: msg.clockLimitSec,
      clockWMs: msg.clockWMs,
      clockBMs: msg.clockBMs,
      asHost: msg.asHost,
      peerProfileId: msg.peerProfileId,
      challenge: msg.challenge,
    });
    if (!result.ok) {
      return json({ error: result.error, game: result.game ?? null }, result.status ?? 400);
    }
    return json(result);
  }

  if (msg.op === "finish") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const result = await finishGame(self, msg.room);
    if (!result.ok) return json({ error: result.error }, result.status ?? 400);
    return json(result);
  }

  if (msg.op === "later") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const result = await deferGameLater(self, msg.room);
    if (!result.ok) return json({ error: result.error }, result.status ?? 400);
    return json(result);
  }

  if (msg.op === "drop") {
    const self = await requireSession();
    if (typeof self !== "string") return self;
    const result = await dropGame(self, msg.room);
    if (!result.ok) return json({ error: result.error }, result.status ?? 400);
    return json(result);
  }

  return json({ error: "unknown op" }, 400);
}

async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "listMine";
  const self = await requireSession();
  if (typeof self !== "string") return self;

  if (op === "listMine") {
    const games = await listMineGames(self);
    return json({ games });
  }
  if (op === "getByRoom") {
    const room = url.searchParams.get("room") ?? "";
    const game = await getGameByRoom(room, self);
    if (
      game &&
      game.status === "open" &&
      (game.whiteProfileId === self || game.blackProfileId === self)
    ) {
      return json({ game });
    }
    return json({ game: null });
  }
  return json({ error: "unknown op" }, 400);
}

async function handle(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(request);
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[games] error:", error);
    return json({ error: "games failed" }, 500);
  }
}

export const Route = createFileRoute("/api/games")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
