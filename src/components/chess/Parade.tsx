import { useEffect, useState, type ReactNode } from "react";
import {
  PIECE_LABEL,
  type BoardTheme,
  type Faction,
  type PieceType,
  type Side,
  factionSrc,
} from "@/lib/chess/catalog";
import { cn } from "@/lib/utils";

const WHITE_BACK: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
const BLACK_BACK: PieceType[] = ["r", "n", "b", "k", "q", "b", "n", "r"];
const FILES_W = ["a", "b", "c", "d", "e", "f", "g", "h"];
const FILES_B = ["h", "g", "f", "e", "d", "c", "b", "a"];

interface ParadeProps {
  first: Faction;
  second: Faction;
  firstSide: Side;
  secondSide: Side;
  board: BoardTheme;
  onDone: () => void;
}

export function Parade({ first, second, firstSide, secondSide, board, onDone }: ParadeProps) {
  const [shot, setShot] = useState<0 | 1>(0);
  const faction = shot === 0 ? first : second;
  const side = shot === 0 ? firstSide : secondSide;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = window.setTimeout(onDone, 1600);
      return () => window.clearTimeout(t);
    }
    const cut = window.setTimeout(() => setShot(1), 4200);
    const done = window.setTimeout(onDone, 8600);
    return () => {
      window.clearTimeout(cut);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className="parade-root">
      <div aria-hidden className="arena-wash parade-wash" />
      <RankFlyby key={faction.id} faction={faction} side={side} board={board} />
      <div className="parade-copy">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">{shot === 0 ? "Your host" : "The other throne"}</p>
        <p className="font-display mt-1 text-5xl leading-none sm:text-6xl">{faction.name}</p>
        <p className="mt-1 text-sm text-muted">{faction.epithet}</p>
      </div>
      <button type="button" className="parade-skip" onClick={onDone}>
        Skip
      </button>
    </div>
  );
}

function RankFlyby({
  faction,
  side,
  board,
}: {
  faction: Faction;
  side: Side;
  board: BoardTheme;
}) {
  const back = side === "w" ? WHITE_BACK : BLACK_BACK;
  const files = side === "w" ? FILES_W : FILES_B;
  const pawnRank = side === "w" ? "2" : "7";
  const backRank = side === "w" ? "1" : "8";

  return (
    <div className="parade-scene">
      <div className="parade-truck">
        <div
          className="parade-dais"
          style={{
            background: board.table,
            boxShadow:
              "0 32px 80px rgba(0,0,0,.72), inset 0 0 0 1px color-mix(in oklab, var(--color-gold) 28%, transparent)",
          }}
        >
          <div className="parade-grid" style={{ boxShadow: `0 0 0 3px ${board.frame}` }}>
            {back.map((type, i) => (
              <Square
                key={`p-${i}`}
                light={i % 2 === 0}
                board={board}
                file={files[i]}
                rank={pawnRank}
                showFile={false}
              >
                <Host
                  faction={faction}
                  type="p"
                  side={side}
                  label={`${faction.name} pawn ${files[i]}${pawnRank}`}
                />
              </Square>
            ))}
            {back.map((type, i) => (
              <Square
                key={`b-${i}`}
                light={i % 2 === 1}
                board={board}
                file={files[i]}
                rank={backRank}
                showFile
              >
                <Host
                  faction={faction}
                  type={type}
                  side={side}
                  label={`${faction.name} ${PIECE_LABEL[type]} ${files[i]}${backRank}`}
                />
              </Square>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Square({
  light,
  board,
  file,
  rank,
  showFile,
  children,
}: {
  light: boolean;
  board: BoardTheme;
  file: string;
  rank: string;
  showFile: boolean;
  children: ReactNode;
}) {
  const texture = light ? board.light : board.dark;
  const fill = light ? board.lightFill : board.darkFill;
  return (
    <div className="parade-sq" style={{ backgroundColor: fill }}>
      {texture ? (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${texture})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: light ? 0.5 : 0.3,
          }}
        />
      ) : null}
      {children}
      {showFile ? (
        <span className={cn("parade-file", light ? "text-obsidian/55" : "text-ivory/70")}>{file}</span>
      ) : (
        <span className={cn("parade-rank", light ? "text-obsidian/55" : "text-ivory/70")}>{rank}</span>
      )}
    </div>
  );
}

function Host({
  faction,
  type,
  side,
  label,
}: {
  faction: Faction;
  type: PieceType;
  side: Side;
  label: string;
}) {
  const extra = faction.typeScale?.[type] ?? 1;
  const width = faction.scale.width * extra * 100;
  const glyph = faction.fit === "glyph";
  return (
    <div className="parade-host">
      <img
        src={factionSrc(faction, type)}
        alt={label}
        draggable={false}
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fallback) return;
          el.dataset.fallback = "1";
          el.src = `/sets/sigil/${side}-${type}.svg?v=3`;
        }}
        className={cn(
          "block select-none object-contain object-bottom",
          glyph ? "piece-glyph h-[92%] w-auto" : "piece-statue h-[108%] w-auto",
          side === "w" ? "is-white" : "is-black",
        )}
        style={{ width: `${width}%`, maxWidth: "none", maxHeight: glyph ? "96%" : "118%" }}
      />
    </div>
  );
}
