import type { PieceType } from "./catalog";

export type NetMsg =
  | { t: "hello"; host: boolean; name: string }
  | { t: "sync"; fen: string; setId: string; boardId: string; wFaction?: string; bFaction?: string }
  | {
      t: "move";
      from: string;
      to: string;
      promotion?: PieceType;
      fen: string;
    }
  | { t: "resign" }
  | { t: "reset"; fen: string }
  | { t: "theme"; setId: string; boardId: string; wFaction?: string; bFaction?: string };

export function isNetMsg(v: unknown): v is NetMsg {
  return !!v && typeof v === "object" && "t" in v && typeof (v as { t: unknown }).t === "string";
}

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(len = 5): string {
  let s = "";
  const buf = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) s += ALPHA[buf[i] % ALPHA.length];
  return s;
}

export function hostKey(code: string) {
  return `sanctum-host-${code.toUpperCase()}`;
}

export function peerKey(code: string) {
  return `sanctum-peer-${code.toUpperCase()}`;
}
