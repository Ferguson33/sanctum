export type Profile = {
  id: string;
  displayName: string;
  crestFaction: string;
  crestPiece: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Standing = Profile & { wins: number; losses: number };

export type MatchRow = {
  id: string;
  winnerId: string;
  loserId: string;
  wFaction: string;
  bFaction: string;
  room: string | null;
  endedAt: string;
};

/** Persisted in-progress (or finished) online duel for My games. */
export type GameRow = {
  id: string;
  room: string;
  fen: string;
  ply: number;
  wFaction: string;
  bFaction: string;
  board: string;
  clockLimitSec: number | null;
  clockWMs: number | null;
  clockBMs: number | null;
  whiteProfileId: string | null;
  blackProfileId: string | null;
  status: "open" | "finished";
  updatedAt: string;
  /** Seat relative to the signed-in profile when listed via listMine. */
  mySide?: "w" | "b";
  /** live = both should be in the app now (clock ok). later = pick up on My games (no clock). */
  challenge?: "live" | "later" | null;
  expiresAt?: string | null;
};
