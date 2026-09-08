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
