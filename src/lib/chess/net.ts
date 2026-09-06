import { knownBoardId, knownFactionId, type PieceType } from "./catalog";

export type TableWire = { w: string; b: string; board: string };

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
  | {
      t: "state";
      fen: string;
      ply: number;
      from?: string;
      to?: string;
      promotion?: PieceType;
      wFaction?: string;
      bFaction?: string;
      boardId?: string;
    }
  | { t: "have"; ply: number }
  | { t: "resign" }
  | { t: "reset"; fen: string }
  | { t: "theme"; setId: string; boardId: string; wFaction?: string; bFaction?: string };

export function isNetMsg(v: unknown): v is NetMsg {
  return !!v && typeof v === "object" && "t" in v && typeof (v as { t: unknown }).t === "string";
}

export function parseTable(input: { w?: string; b?: string; board?: string } | null | undefined): TableWire | null {
  if (!input) return null;
  const w = knownFactionId(input.w);
  const board = knownBoardId(input.board);
  if (!w || !board) return null;
  const b = knownFactionId(input.b) ?? "";
  return { w, b, board };
}

export function tableQuery(t: TableWire): string {
  const p = new URLSearchParams({ w: t.w, board: t.board });
  if (t.b) p.set("b", t.b);
  else p.set("open", "1");
  return p.toString();
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
