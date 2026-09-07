/**
 * Piece catalog — add a host without touching rules or the board.
 *
 * A FACTION is one army (6 sculptures). A PIECE_SET is a suggested pairing
 * (white faction vs black faction). Players can mix freely: Elves vs Ruin, etc.
 *
 * To add a new paired sculpture set:
 *   1. Drop 6 pair photos (left = white host, right = black host) or 12 cutouts.
 *   2. Isolate to transparent WebP in /public/sets/<id>/
 *        w-k.png w-q.png w-r.png w-b.png w-n.png w-p.png
 *        b-k.png b-q.png b-r.png b-b.png b-n.png b-p.png
 *      (see scripts/isolate-set.py)
 *   3. Push two FACTIONS (white file: "w", black file: "b") and one PIECE_SETS
 *      pairing. That's the whole game change.
 *
 * Add a board: textures in /public/boards/<id>/ plus a BOARD_THEMES row.
 * The engine never reads these files — only this registry.
 */

export type PieceType = "k" | "q" | "r" | "b" | "n" | "p";
export type Side = "w" | "b";

export const PIECE_TYPES: PieceType[] = ["k", "q", "r", "b", "n", "p"];

export interface Faction {
  id: string;
  name: string;
  epithet: string;
  family: string;
  dir: string;
  ext: "png" | "svg" | "webp";
  /** Which filename prefix in the folder (w-* or b-*). Independent of who moves first. */
  file: Side;
  scale: { width: number; height: number };
  typeScale?: Partial<Record<PieceType, number>>;
  fit: "glyph" | "statue";
  /** Optional cinematic intro (mp4). Poster is the same path with .jpg */
  intro?: string;
}

export interface PieceSet {
  id: string;
  name: string;
  tagline: string;
  w: string;
  b: string;
}

export interface BoardTheme {
  id: string;
  name: string;
  tagline: string;
  light: string;
  dark: string;
  lightFill: string;
  darkFill: string;
  frame: string;
  table: string;
  inlay: string;
}

const SANCTUM_SCALE = {
  scale: { width: 0.84, height: 1.02 },
  typeScale: { r: 1.0, n: 1.04, q: 1.0, k: 1.06, b: 0.96, p: 0.62 } as Partial<Record<PieceType, number>>,
  fit: "statue" as const,
};

const GROVE_SCALE = {
  scale: { width: 0.86, height: 1.04 },
  typeScale: { r: 1.08, n: 1.18, q: 1.02, k: 0.96, b: 1.0, p: 0.58 } as Partial<Record<PieceType, number>>,
  fit: "statue" as const,
};

const CANON_SCALE = {
  scale: { width: 0.9, height: 0.9 },
  typeScale: { p: 0.68, n: 1.02, b: 0.98, r: 0.96, q: 1.0, k: 1.04 } as Partial<Record<PieceType, number>>,
  fit: "glyph" as const,
};

const PAGEANT_SCALE = {
  scale: { width: 0.88, height: 1.06 },
  typeScale: { r: 1.14, n: 1.22, q: 1.06, k: 1.12, b: 1.0, p: 0.54 } as Partial<Record<PieceType, number>>,
  fit: "statue" as const,
};

export const FACTIONS: Faction[] = [
  {
    id: "good",
    name: "Solace",
    epithet: "the Ivory Host",
    family: "Sanctum",
    dir: "sanctum",
    ext: "webp",
    file: "w",
    ...SANCTUM_SCALE,
    intro: "/sets/sanctum/intro-solace.mp4?v=3",
  },
  {
    id: "evil",
    name: "Ruin",
    epithet: "the Ember Court",
    family: "Sanctum",
    dir: "sanctum",
    ext: "webp",
    file: "b",
    ...SANCTUM_SCALE,
    intro: "/sets/sanctum/intro-ruin.mp4?v=3",
  },
  {
    id: "elves",
    name: "Elves",
    epithet: "the Nightgrove",
    family: "Grove",
    dir: "grove",
    ext: "webp",
    file: "w",
    ...GROVE_SCALE,
    intro: "/sets/grove/intro-elves.mp4?v=3",
  },
  {
    id: "dwarves",
    name: "Dwarves",
    epithet: "the Underhold",
    family: "Grove",
    dir: "grove",
    ext: "webp",
    file: "b",
    ...GROVE_SCALE,
    intro: "/sets/grove/intro-dwarves.mp4",
  },
  {
    id: "canon-ivory",
    name: "Ivory",
    epithet: "the readable host",
    family: "Canon",
    dir: "sigil",
    ext: "svg",
    file: "w",
    ...CANON_SCALE,
  },
  {
    id: "canon-ember",
    name: "Ember",
    epithet: "the readable court",
    family: "Canon",
    dir: "sigil",
    ext: "svg",
    file: "b",
    ...CANON_SCALE,
  },
  {
    id: "atlantis",
    name: "Atlantis",
    epithet: "the Drowned Court",
    family: "Tide",
    dir: "atlantis",
    ext: "webp",
    file: "w",
    ...PAGEANT_SCALE,
    intro: "/sets/atlantis/intro.mp4",
  },
  {
    id: "samurai",
    name: "Samurai",
    epithet: "the Bakufu",
    family: "East",
    dir: "bakufu",
    ext: "webp",
    file: "w",
    ...PAGEANT_SCALE,
    intro: "/sets/bakufu/intro.mp4",
  },
  {
    id: "aliens",
    name: "Aliens",
    epithet: "the Far Choir",
    family: "Void",
    dir: "drift",
    ext: "webp",
    file: "w",
    ...PAGEANT_SCALE,
    intro: "/sets/drift/intro.mp4",
  },
];

export const PIECE_SETS: PieceSet[] = [
  {
    id: "sigil",
    name: "Canon",
    tagline: "Ivory and ember, cut to read at a glance",
    w: "canon-ivory",
    b: "canon-ember",
  },
  {
    id: "sanctum",
    name: "Sanctum",
    tagline: "Solace against Ruin",
    w: "good",
    b: "evil",
  },
  {
    id: "grove",
    name: "Grove",
    tagline: "Elves against Dwarves",
    w: "elves",
    b: "dwarves",
  },
  {
    id: "tide",
    name: "Tide",
    tagline: "Atlantis against the Bakufu",
    w: "atlantis",
    b: "samurai",
  },
  {
    id: "void",
    name: "Void",
    tagline: "The Far Choir against Ruin",
    w: "aliens",
    b: "evil",
  },
];

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "reliquary",
    name: "Reliquary",
    tagline: "Marble and gold leaf",
    light: "/boards/reliquary/light.jpg",
    dark: "/boards/reliquary/dark.jpg",
    lightFill: "#e8d6b0",
    darkFill: "#7a5533",
    frame: "#c5a46a",
    table: "#1a1612",
    inlay: "#8a7040",
  },
  {
    id: "ember",
    name: "Ashen Gate",
    tagline: "Ivory stone over lava",
    light: "/boards/ember/light.jpg",
    dark: "/boards/ember/dark.jpg",
    lightFill: "#e6d4b2",
    darkFill: "#6b3e2a",
    frame: "#e25822",
    table: "#120c0a",
    inlay: "#7a2e18",
  },
  {
    id: "night",
    name: "Night Court",
    tagline: "Cool stone, high contrast",
    light: "",
    dark: "",
    lightFill: "#d9d0c2",
    darkFill: "#3a3734",
    frame: "#9a9187",
    table: "#101014",
    inlay: "#5c5854",
  },
  {
    id: "abyss",
    name: "Abyss",
    tagline: "Ice over the drowned city",
    light: "/boards/abyss/light.jpg",
    dark: "/boards/abyss/dark.jpg",
    lightFill: "#b7d4d9",
    darkFill: "#0c3a42",
    frame: "#5ec8d6",
    table: "#061418",
    inlay: "#1a6a72",
  },
  {
    id: "lacquer",
    name: "Lacquer",
    tagline: "Gold dust on black",
    light: "/boards/lacquer/light.jpg",
    dark: "/boards/lacquer/dark.jpg",
    lightFill: "#e8d5b0",
    darkFill: "#16110c",
    frame: "#c4a056",
    table: "#0c0a08",
    inlay: "#7a5a28",
  },
  {
    id: "nebula",
    name: "Nebula",
    tagline: "Stone that isn't stone",
    light: "/boards/nebula/light.jpg",
    dark: "/boards/nebula/dark.jpg",
    lightFill: "#d5cce4",
    darkFill: "#1a1028",
    frame: "#8a6cff",
    table: "#0a0614",
    inlay: "#3a2060",
  },
];

export const DEFAULT_SET_ID = "grove";
export const DEFAULT_W_FACTION = "elves";
export const DEFAULT_B_FACTION = "dwarves";
export const DEFAULT_BOARD_ID = "reliquary";

/** Poster statues — one signature from each sculpted host. */
export const HERO_LINEUP: { faction: string; type: PieceType }[] = [
  { faction: "good", type: "k" },
  { faction: "elves", type: "n" },
  { faction: "dwarves", type: "k" },
  { faction: "evil", type: "k" },
];

export function knownFactionId(id: string | null | undefined): string | undefined {
  return FACTIONS.some((f) => f.id === id) ? id! : undefined;
}

export function knownBoardId(id: string | null | undefined): string | undefined {
  return BOARD_THEMES.some((b) => b.id === id) ? id! : undefined;
}

export function getSet(id: string | null | undefined): PieceSet {
  return PIECE_SETS.find((s) => s.id === id) ?? PIECE_SETS[0];
}

export function getFaction(id: string | null | undefined): Faction {
  return FACTIONS.find((f) => f.id === id) ?? FACTIONS.find((f) => f.id === DEFAULT_W_FACTION)!;
}

/** First host that isn't `avoid`. Prefer `wanted` when it's free. */
export function otherFaction(avoid: string, wanted?: string | null): string {
  if (wanted && wanted !== avoid && FACTIONS.some((f) => f.id === wanted)) return wanted;
  return FACTIONS.find((f) => f.id !== avoid)?.id ?? FACTIONS[0].id;
}

export function getBoard(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((b) => b.id === id) ?? BOARD_THEMES[0];
}

export function pairingOf(wId: string, bId: string): PieceSet | undefined {
  return PIECE_SETS.find((s) => s.w === wId && s.b === bId);
}

export function tableName(w: Faction, b: Faction): string {
  return pairingOf(w.id, b.id)?.name ?? `${w.name} vs ${b.name}`;
}

export function factionSrc(faction: Faction, type: PieceType): string {
  const bust = faction.ext === "svg" ? "?v=3" : "?v=4";
  return `/sets/${faction.dir}/${faction.file}-${type}.${faction.ext}${bust}`;
}

export function pieceSrc(set: PieceSet, side: Side, type: PieceType): string {
  return factionSrc(getFaction(side === "w" ? set.w : set.b), type);
}

export const PIECE_LABEL: Record<PieceType, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};

export const PIECE_CARD: Record<PieceType, string> = {
  k: "The throne. One square any way. Castles with a rook once.",
  q: "The long arm. Any direction, any distance.",
  r: "The keep. Files and ranks, as far as they run.",
  b: "The rite. Diagonals only.",
  n: "The rider. Two and one, over anything in the way.",
  p: "The line. Forward, captures aside. Two steps from home, then one.",
};

export const GALLERIES: Record<string, { src: string; label: string }[]> = {
  sigil: [
    { src: "/gallery/kings.jpg", label: "Kings" },
    { src: "/gallery/queens.jpg", label: "Queens" },
    { src: "/gallery/bishops.jpg", label: "Bishops" },
    { src: "/gallery/knights.jpg", label: "Knights" },
    { src: "/gallery/rooks.jpg", label: "Rooks" },
    { src: "/gallery/pawns.jpg", label: "Pawns" },
  ],
  sanctum: [
    { src: "/gallery/kings.jpg", label: "Kings" },
    { src: "/gallery/queens.jpg", label: "Queens" },
    { src: "/gallery/bishops.jpg", label: "Bishops" },
    { src: "/gallery/knights.jpg", label: "Knights" },
    { src: "/gallery/rooks.jpg", label: "Rooks" },
    { src: "/gallery/pawns.jpg", label: "Pawns" },
  ],
  grove: [
    { src: "/gallery/grove-k.jpg", label: "Kings" },
    { src: "/gallery/grove-q.jpg", label: "Queens" },
    { src: "/gallery/grove-b.jpg", label: "Bishops" },
    { src: "/gallery/grove-n.jpg", label: "Knights" },
    { src: "/gallery/grove-r.jpg", label: "Rooks" },
    { src: "/gallery/grove-p.jpg", label: "Pawns" },
  ],
};
