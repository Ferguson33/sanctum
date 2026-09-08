import { Chess, type Square as ChessSquare } from "chess.js";
import type { PieceType, Side } from "./catalog";

export type Square = ChessSquare;

export interface LivePiece {
  id: string;
  type: PieceType;
  color: Side;
  square: Square;
}

export interface MoveRec {
  from: Square;
  to: Square;
  promotion?: PieceType;
  san: string;
  captured?: PieceType;
  flags: string;
}

export function newGame(): Chess {
  return new Chess();
}

export function loadFen(fen: string): Chess {
  return new Chess(fen);
}

export function legalMoves(chess: Chess, from: Square): MoveRec[] {
  return chess.moves({ square: from, verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion as PieceType | undefined,
    san: m.san,
    captured: m.captured as PieceType | undefined,
    flags: m.flags,
  }));
}

export function allLegal(chess: Chess): MoveRec[] {
  return chess.moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion as PieceType | undefined,
    san: m.san,
    captured: m.captured as PieceType | undefined,
    flags: m.flags,
  }));
}

export function needsPromotion(chess: Chess, from: Square, to: Square): boolean {
  return legalMoves(chess, from).some((m) => m.to === to && m.promotion);
}

export function playMove(
  chess: Chess,
  from: Square,
  to: Square,
  promotion?: PieceType,
): MoveRec | null {
  try {
    const m = chess.move({ from, to, promotion });
    if (!m) return null;
    return {
      from: m.from,
      to: m.to,
      promotion: m.promotion as PieceType | undefined,
      san: m.san,
      captured: m.captured as PieceType | undefined,
      flags: m.flags,
    };
  } catch {
    return null;
  }
}

export function turnOf(chess: Chess): Side {
  return chess.turn();
}

export function inCheck(chess: Chess): boolean {
  return chess.isCheck();
}

export function kingSquare(chess: Chess, color: Side): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === color) {
        const file = "abcdefgh"[f];
        const rank = String(8 - r);
        return `${file}${rank}` as Square;
      }
    }
  }
  return null;
}

export type Ending =
  | { kind: "checkmate"; winner: Side }
  | { kind: "stalemate" }
  | { kind: "draw"; reason: string }
  | { kind: "resign"; winner: Side }
  | null;

export function endingOf(chess: Chess): Ending {
  if (chess.isCheckmate()) {
    return { kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  }
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isThreefoldRepetition()) return { kind: "draw", reason: "threefold repetition" };
  if (chess.isInsufficientMaterial()) return { kind: "draw", reason: "insufficient material" };
  if (chess.isDraw()) return { kind: "draw", reason: "draw" };
  return null;
}

export function piecesFromFen(fen: string): LivePiece[] {
  const chess = new Chess(fen);
  const board = chess.board();
  const out: LivePiece[] = [];
  const seen: Record<string, number> = {};
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const file = "abcdefgh"[f];
      const rank = String(8 - r);
      const square = `${file}${rank}` as Square;
      const key = `${p.color}-${p.type}`;
      seen[key] = (seen[key] ?? 0) + 1;
      out.push({
        // Stable id (no square) so resize/rebuild doesn't orphan tweens.
        id: `${key}-${seen[key]}`,
        type: p.type as PieceType,
        color: p.color as Side,
        square,
      });
    }
  }
  return out;
}

/** Apply a move to a live piece list, keeping ids stable so CSS can tween. */
/** True castling only — never treat a random flag substring as O-O. */
export function castleSideOf(move: MoveRec): "k" | "q" | null {
  if (move.san === "O-O" || move.flags === "k") return "k";
  if (move.san === "O-O-O" || move.flags === "q") return "q";
  // King moved exactly two files on its back rank.
  const fromFile = move.from.charCodeAt(0);
  const toFile = move.to.charCodeAt(0);
  if (move.from[1] === move.to[1] && Math.abs(toFile - fromFile) === 2) {
    return toFile > fromFile ? "k" : "q";
  }
  return null;
}

export function applyMoveToPieces(pieces: LivePiece[], move: MoveRec): LivePiece[] {
  const castle = castleSideOf(move);
  const next = pieces.filter((p) => {
    if (p.square === move.to) return false;
    if (move.flags.includes("e") && p.type === "p") {
      const file = move.to[0];
      const rank = move.from[1];
      if (p.square === `${file}${rank}`) return false;
    }
    return true;
  });
  return next.map((p) => {
    if (p.square !== move.from) {
      if (castle === "k" && p.type === "r") {
        if (p.color === "w" && p.square === "h1") return { ...p, square: "f1" as Square };
        if (p.color === "b" && p.square === "h8") return { ...p, square: "f8" as Square };
      }
      if (castle === "q" && p.type === "r") {
        if (p.color === "w" && p.square === "a1") return { ...p, square: "d1" as Square };
        if (p.color === "b" && p.square === "a8") return { ...p, square: "d8" as Square };
      }
      return p;
    }
    return {
      ...p,
      square: move.to,
      type: move.promotion ?? p.type,
    };
  });
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export function squareAt(file: string, rank: string): Square {
  return `${file}${rank}` as Square;
}

export function fileIndex(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

export function rankIndex(sq: Square): number {
  return Number(sq[1]) - 1;
}

export function capturesBy(history: MoveRec[], taker: Side): PieceType[] {
  const out: PieceType[] = [];
  let turn: Side = "w";
  for (const m of history) {
    if (m.captured && turn === taker) out.push(m.captured);
    turn = turn === "w" ? "b" : "w";
  }
  return out;
}
