import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FACTIONS, PIECE_TYPES, type PieceType } from "@/lib/chess/catalog";
import {
  clearProfileSession,
  getSessionProfileId,
  setProfileSession,
} from "@/lib/profile/session";
import {
  createProfile,
  getProfile,
  h2h,
  listStandings,
  recordMatch,
  verifyProfilePin,
} from "@/lib/profile/store";

const FACTION_IDS = FACTIONS.map((f) => f.id) as [string, ...string[]];
const PIECE_IDS = PIECE_TYPES as unknown as [PieceType, ...PieceType[]];

const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
const nameSchema = z.string().trim().min(2).max(24);

const claimSchema = z.object({
  op: z.literal("claim"),
  name: nameSchema,
  pin: pinSchema,
  crestFaction: z.enum(FACTION_IDS),
  crestPiece: z.enum(PIECE_IDS),
});

const signinSchema = z.object({
  op: z.literal("signin"),
  name: nameSchema,
  pin: pinSchema,
});

const signoutSchema = z.object({ op: z.literal("signout") });
const meSchema = z.object({ op: z.literal("me") });
const standingsSchema = z.object({ op: z.literal("standings") });
const h2hSchema = z.object({
  op: z.literal("h2h"),
  otherId: z.string().min(1).max(64),
});
const recordSchema = z.object({
  op: z.literal("record"),
  winnerId: z.string().min(1).max(64),
  loserId: z.string().min(1).max(64),
  wFaction: z.enum(FACTION_IDS),
  bFaction: z.enum(FACTION_IDS),
  room: z.string().min(1).max(32).optional(),
});

const postSchema = z.discriminatedUnion("op", [
  claimSchema,
  signinSchema,
  signoutSchema,
  meSchema,
  standingsSchema,
  h2hSchema,
  recordSchema,
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handleMe() {
  const id = await getSessionProfileId();
  if (!id) return json({ profile: null });
  const profile = await getProfile(id);
  return json({ profile });
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

  if (msg.op === "claim") {
    try {
      const profile = await createProfile({
        name: msg.name,
        pin: msg.pin,
        crestFaction: msg.crestFaction,
        crestPiece: msg.crestPiece,
      });
      await setProfileSession(profile.id);
      return json({ profile });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      if (code === "NAME_TAKEN") return json({ error: "That name is already claimed" }, 409);
      throw err;
    }
  }

  if (msg.op === "signin") {
    const profile = await verifyProfilePin(msg.name, msg.pin);
    if (!profile) return json({ error: "Wrong name or PIN" }, 401);
    await setProfileSession(profile.id);
    return json({ profile });
  }

  if (msg.op === "signout") {
    clearProfileSession();
    return json({ ok: true });
  }

  if (msg.op === "me") return handleMe();

  if (msg.op === "standings") {
    const standings = await listStandings();
    return json({ standings });
  }

  if (msg.op === "h2h") {
    const selfId = await getSessionProfileId();
    if (!selfId) return json({ error: "Sign in first" }, 401);
    const other = await getProfile(msg.otherId);
    const result = await h2h(selfId, msg.otherId);
    return json({ ...result, other });
  }

  if (msg.op === "record") {
    const selfId = await getSessionProfileId();
    if (!selfId) return json({ error: "Sign in first" }, 401);
    if (selfId !== msg.winnerId && selfId !== msg.loserId) {
      return json({ error: "You must be one of the players" }, 403);
    }
    const result = await recordMatch({
      winnerId: msg.winnerId,
      loserId: msg.loserId,
      wFaction: msg.wFaction,
      bFaction: msg.bFaction,
      room: msg.room,
    });
    if (!result.ok) return json({ error: result.error }, 400);
    return json(result);
  }

  return json({ error: "unknown op" }, 400);
}

async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "me";
  if (op === "me") return handleMe();
  if (op === "standings") {
    const standings = await listStandings();
    return json({ standings });
  }
  return json({ error: "unknown op" }, 400);
}

async function handle(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(request);
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[profile] error:", error);
    return json({ error: "profile failed" }, 500);
  }
}

export const Route = createFileRoute("/api/profile")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
