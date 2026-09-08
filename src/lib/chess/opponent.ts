import { Chess } from "chess.js";
import type { PieceType } from "./catalog";
import type { Square } from "./engine";

export type AiLevelId = "squire" | "knight" | "lord" | "king";

export const AI_LEVELS: {
  id: AiLevelId;
  name: string;
  blurb: string;
  elo: number;
  skill: number;
  limit: boolean;
  movetime: number;
}[] = [
  // Stockfish UCI_Elo floors ~1320 — Squire stays soft via heuristic + blunders, not the engine floor.
  { id: "squire", name: "Squire", blurb: "Easy. Makes mistakes.", elo: 900, skill: 0, limit: true, movetime: 80 },
  { id: "knight", name: "Knight", blurb: "Solid novice. Occasional gifts.", elo: 1320, skill: 2, limit: true, movetime: 320 },
  { id: "lord", name: "Lord", blurb: "Club sharp. Few free pieces.", elo: 1700, skill: 10, limit: true, movetime: 650 },
  { id: "king", name: "King", blurb: "Full strength.", elo: 3190, skill: 20, limit: false, movetime: 1200 },
];

export function getAiLevel(id: string | undefined): (typeof AI_LEVELS)[number] {
  return AI_LEVELS.find((l) => l.id === id) ?? AI_LEVELS[1];
}

export type AiMove = { from: Square; to: Square; promotion?: PieceType };

const ENGINE_SRC = "/engine/stockfish-18-lite-single.js";

let worker: Worker | null = null;
let boot: Promise<Worker> | null = null;
let busy = Promise.resolve();

function send(w: Worker, line: string) {
  w.postMessage(line);
}

function waitFor(w: Worker, pred: (line: string) => boolean, ms = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      w.removeEventListener("message", onMsg);
      reject(new Error("engine silence"));
    }, ms);
    const onMsg = (e: MessageEvent) => {
      const line = String(e.data ?? "");
      if (!pred(line)) return;
      window.clearTimeout(t);
      w.removeEventListener("message", onMsg);
      resolve(line);
    };
    w.addEventListener("message", onMsg);
  });
}

async function bootEngine(): Promise<Worker> {
  if (worker) return worker;
  if (boot) return boot;
  const created = new Worker(ENGINE_SRC);
  boot = (async () => {
    send(created, "uci");
    await waitFor(created, (l) => l.includes("uciok"), 25_000);
    send(created, "isready");
    await waitFor(created, (l) => l.includes("readyok"));
    worker = created;
    return created;
  })();
  try {
    return await boot;
  } catch (err) {
    boot = null;
    created.terminate();
    worker = null;
    throw err;
  }
}

function parseBest(line: string): AiMove | null {
  const m = /\bbestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/i.exec(line);
  if (!m) return null;
  return {
    from: m[1] as Square,
    to: m[2] as Square,
    promotion: m[3] ? (m[3] as PieceType) : undefined,
  };
}

async function stockfishMove(fen: string, level: (typeof AI_LEVELS)[number]): Promise<AiMove> {
  const w = await bootEngine();
  const job = busy.then(async () => {
    send(w, "ucinewgame");
    send(w, `setoption name Skill Level value ${level.skill}`);
    send(w, `setoption name UCI_LimitStrength value ${level.limit ? "true" : "false"}`);
    if (level.limit) send(w, `setoption name UCI_Elo value ${level.elo}`);
    send(w, "isready");
    await waitFor(w, (l) => l.includes("readyok"), 8_000);
    send(w, `position fen ${fen}`);
    send(w, `go movetime ${level.movetime}`);
    const line = await waitFor(w, (l) => l.startsWith("bestmove"), level.movetime + 8_000);
    const mv = parseBest(line);
    if (!mv) throw new Error("no bestmove");
    return mv;
  });
  busy = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function pickMove(mv: { from: string; to: string; promotion?: string }): AiMove {
  return {
    from: mv.from as Square,
    to: mv.to as Square,
    promotion: mv.promotion ? (mv.promotion as PieceType) : undefined,
  };
}

/** Soft table — random blunders so Squire stays below Stockfish's Elo floor. */
function squireMove(fen: string): AiMove {
  const chess = new Chess(fen);
  const verbose = chess.moves({ verbose: true });
  if (!verbose.length) throw new Error("no moves");
  // ~40%: pure random legal move (hangs pieces, misses mates).
  if (Math.random() < 0.4) {
    return pickMove(verbose[Math.floor(Math.random() * verbose.length)]);
  }
  let best = verbose[0];
  let bestScore = -Infinity;
  for (const mv of verbose) {
    const next = new Chess(fen);
    next.move(mv);
    // Huge noise + weak capture hunger = leaves stuff en prise.
    let score = -evalBoard(next) + Math.random() * 420;
    if (mv.captured) score += (VAL[mv.captured] ?? 0) * 0.08;
    if (next.isCheckmate()) score += 5000;
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return pickMove(best);
}

function heuristicMove(fen: string, level: (typeof AI_LEVELS)[number]): AiMove {
  if (level.id === "squire") return squireMove(fen);
  const chess = new Chess(fen);
  const depth = level.id === "knight" ? 1 : level.id === "lord" ? 2 : 3;
  const noise = level.id === "knight" ? 120 : level.id === "lord" ? 50 : 20;
  const verbose = chess.moves({ verbose: true });
  if (!verbose.length) throw new Error("no moves");
  let best = verbose[0];
  let bestScore = -Infinity;
  for (const mv of verbose) {
    const next = new Chess(fen);
    next.move(mv);
    let score = -evalBoard(next) + Math.random() * noise;
    if (mv.captured) score += (VAL[mv.captured] ?? 0) * 0.15;
    if (depth >= 1 && !next.isGameOver()) {
      score -= replyScore(next, depth - 1);
    }
    if (next.isCheckmate()) score += 8000;
    else if (next.isCheck()) score += 40;
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return pickMove(best);
}

function evalBoard(chess: Chess): number {
  const turn = chess.turn();
  let s = 0;
  const board = chess.board();
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      const v = VAL[p.type] ?? 0;
      s += p.color === "w" ? v : -v;
    }
  }
  return turn === "w" ? s : -s;
}

function replyScore(chess: Chess, depth: number): number {
  const moves = chess.moves({ verbose: true });
  let best = -Infinity;
  for (const mv of moves) {
    const next = new Chess(chess.fen());
    next.move(mv);
    let score = -evalBoard(next);
    if (mv.captured) score += (VAL[mv.captured] ?? 0) * 0.2;
    if (depth > 0 && !next.isGameOver() && moves.length < 28) {
      score -= replyScore(next, depth - 1) * 0.6;
    }
    if (score > best) best = score;
  }
  return best;
}

function isLegalAiMove(fen: string, mv: AiMove): boolean {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  return legal.some(
    (m) =>
      m.from === mv.from &&
      m.to === mv.to &&
      (mv.promotion ? m.promotion === mv.promotion : !m.promotion || m.promotion === "q"),
  );
}

export async function think(fen: string, levelId: AiLevelId | string | undefined): Promise<AiMove> {
  const level = getAiLevel(levelId);
  // Squire never uses Stockfish — even "Elo 900" clamps near 1320 in practice.
  if (level.id === "squire") return squireMove(fen);
  try {
    const mv = await stockfishMove(fen, level);
    if (isLegalAiMove(fen, mv)) return mv;
  } catch {
    /* fall through */
  }
  return heuristicMove(fen, level);
}

export function warmOpponent() {
  void bootEngine().catch(() => {});
}
