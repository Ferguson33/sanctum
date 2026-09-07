import { useMemo, useRef } from "react";
import {
  type BoardTheme,
  type Faction,
  PIECE_LABEL,
  type PieceType,
  factionSrc,
  type Side,
} from "@/lib/chess/catalog";
import {
  FILES,
  RANKS,
  fileIndex,
  kingSquare,
  rankIndex,
  type LivePiece,
  type Square,
} from "@/lib/chess/engine";
import { screenToSquare } from "@/lib/chess/pick";
import { Chess } from "chess.js";
import { cn } from "@/lib/utils";

interface BoardProps {
  fen: string;
  pieces: LivePiece[];
  orientation: Side;
  selected: Square | null;
  legal: Square[];
  captures: Square[];
  lastMove: { from: Square; to: Square } | null;
  impact?: { square: Square; kind: "move" | "capture" | "check" } | null;
  wFaction: Faction;
  bFaction: Faction;
  board: BoardTheme;
  tilt: number;
  disabled?: boolean;
  onSquare: (sq: Square) => void;
}

export function Board({
  fen,
  pieces,
  orientation,
  selected,
  legal,
  captures,
  lastMove,
  impact,
  wFaction,
  bFaction,
  board,
  tilt,
  disabled,
  onSquare,
}: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const checked = chess.isCheck() ? kingSquare(chess, chess.turn()) : null;
  const tl = useRef<HTMLSpanElement>(null);
  const tr = useRef<HTMLSpanElement>(null);
  const br = useRef<HTMLSpanElement>(null);
  const bl = useRef<HTMLSpanElement>(null);

  const files = orientation === "w" ? [...FILES] : [...FILES].reverse();
  const ranks = orientation === "w" ? [...RANKS].reverse() : [...RANKS];

  function onPointer(e: { clientX: number; clientY: number }) {
    if (disabled) return;
    if (!tl.current || !tr.current || !br.current || !bl.current) return;
    const corner = (el: HTMLElement, which: "tl" | "tr" | "br" | "bl") => {
      const r = el.getBoundingClientRect();
      if (which === "tl") return { x: r.left, y: r.top };
      if (which === "tr") return { x: r.right, y: r.top };
      if (which === "br") return { x: r.right, y: r.bottom };
      return { x: r.left, y: r.bottom };
    };
    const sq = screenToSquare(
      e.clientX,
      e.clientY,
      {
        tl: corner(tl.current, "tl"),
        tr: corner(tr.current, "tr"),
        br: corner(br.current, "br"),
        bl: corner(bl.current, "bl"),
      },
      orientation,
    );
    if (sq) onSquare(sq);
  }

  return (
    <div
      className="board-slot"
      style={{ ["--tilt" as string]: `${tilt}deg` }}
      data-board={board.id}
    >
      <div
        className="scene"
        style={{ perspective: tilt < 1 ? "none" : "2200px" }}
      >
        <div
          className="board-table"
          style={{
            background: board.table,
            boxShadow:
              "0 32px 80px rgba(0,0,0,.72), -32px 8px 48px color-mix(in oklab, var(--color-gold) 16%, transparent), 32px 8px 48px color-mix(in oklab, var(--color-ember) 16%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--color-gold) 28%, transparent)",
            borderRadius: 6,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[2.2%] rounded-sm"
            style={{
              boxShadow: `inset 0 0 0 2px ${board.inlay}`,
              opacity: 0.55,
            }}
          />
          <div
            className="board-3d"
            onClick={onPointer}
          >
            <span ref={tl} data-corner="tl" className="pointer-events-none absolute left-0 top-0 size-[2px] opacity-0" />
            <span ref={tr} data-corner="tr" className="pointer-events-none absolute right-0 top-0 size-[2px] opacity-0" />
            <span ref={br} data-corner="br" className="pointer-events-none absolute bottom-0 right-0 size-[2px] opacity-0" />
            <span ref={bl} data-corner="bl" className="pointer-events-none absolute bottom-0 left-0 size-[2px] opacity-0" />
            <div
              className="absolute inset-0 grid grid-cols-8 grid-rows-8 overflow-visible"
              style={{ boxShadow: `0 0 0 3px ${board.frame}` }}
            >
              {ranks.map((rank, r) =>
                files.map((file, f) => {
                  const sq = `${file}${rank}` as Square;
                  const light = (f + r) % 2 === 0;
                  const isSel = selected === sq;
                  const isLast = lastMove?.from === sq || lastMove?.to === sq;
                  const isCheck = checked === sq;
                  const texture = light ? board.light : board.dark;
                  const fill = light ? board.lightFill : board.darkFill;
                  return (
                    <button
                      key={sq}
                      type="button"
                      disabled={disabled}
                      aria-label={sq}
                      className={cn("relative min-h-0 min-w-0 overflow-hidden p-0", isCheck && "check-pulse")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) onSquare(sq);
                      }}
                      style={{
                        backgroundColor: fill,
                        boxShadow: isSel
                          ? "inset 0 0 0 3px var(--color-gold), inset 0 0 0 6px rgb(11 10 12 / 0.55)"
                          : isLast
                            ? "inset 0 0 0 3px var(--color-gold)"
                            : undefined,
                      }}
                    >
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
                      {isLast ? (
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{
                            background:
                              lastMove?.to === sq
                                ? "color-mix(in oklab, var(--color-gold) 32%, transparent)"
                                : "color-mix(in oklab, var(--color-gold) 18%, transparent)",
                          }}
                        />
                      ) : null}
                      {r === 7 && (
                        <span
                          className={cn(
                            "absolute bottom-0.5 right-1 z-[1] text-[10px] font-medium uppercase leading-none sm:text-xs",
                            light ? "text-obsidian/55" : "text-ivory/70",
                          )}
                        >
                          {file}
                        </span>
                      )}
                      {f === 0 && (
                        <span
                          className={cn(
                            "absolute left-0.5 top-0.5 z-[1] text-[10px] font-medium leading-none sm:text-xs",
                            light ? "text-obsidian/55" : "text-ivory/70",
                          )}
                        >
                          {rank}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>

            <div className="pointer-events-none absolute inset-0">
              {legal.map((sq) => (
                <SquareMark key={`l-${sq}`} square={sq} orientation={orientation} kind="move" />
              ))}
              {captures.map((sq) => (
                <SquareMark key={`c-${sq}`} square={sq} orientation={orientation} kind="capture" />
              ))}
              {impact ? (
                <SquareMark
                  key={`i-${impact.square}-${impact.kind}`}
                  square={impact.square}
                  orientation={orientation}
                  kind={impact.kind === "capture" ? "burst" : impact.kind === "check" ? "check" : "land"}
                />
              ) : null}
              {pieces.map((p) => (
                <PieceView
                  key={p.id}
                  piece={p}
                  orientation={orientation}
                  faction={p.color === "w" ? wFaction : bFaction}
                  selected={selected === p.square}
                  landing={lastMove?.to === p.square}
                  landKey={lastMove ? `${lastMove.from}${lastMove.to}` : ""}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SquareMark({
  square,
  orientation,
  kind,
}: {
  square: Square;
  orientation: Side;
  kind: "move" | "capture" | "land" | "burst" | "check";
}) {
  const fi = fileIndex(square);
  const ri = rankIndex(square);
  const vf = orientation === "w" ? fi : 7 - fi;
  const vr = orientation === "w" ? 7 - ri : ri;
  const markClass =
    kind === "move"
      ? "mark-move"
      : kind === "capture"
        ? "mark-capture"
        : kind === "burst"
          ? "impact-burst"
          : kind === "check"
            ? "impact-check"
            : "impact-land";
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${vf * 12.5}%`,
        top: `${vr * 12.5}%`,
        width: "12.5%",
        height: "12.5%",
        zIndex: vr + 20,
        transform: "translateZ(3px)",
      }}
    >
      <span className={markClass} />
    </div>
  );
}

function PieceView({
  piece,
  orientation,
  faction,
  selected,
  landing,
  landKey,
}: {
  piece: LivePiece;
  orientation: Side;
  faction: Faction;
  selected: boolean;
  landing: boolean;
  landKey: string;
}) {
  const fi = fileIndex(piece.square);
  const ri = rankIndex(piece.square);
  const vf = orientation === "w" ? fi : 7 - fi;
  const vr = orientation === "w" ? 7 - ri : ri;
  const extra = faction.typeScale?.[piece.type as PieceType] ?? 1;
  const glyph = faction.fit === "glyph";
  const sized = (glyph ? faction.scale.width : faction.scale.height) * extra * 100;
  const label = `${faction.name} ${PIECE_LABEL[piece.type]}`;

  return (
    <div
      className="piece-slide absolute flex items-end justify-center overflow-visible"
      style={{
        left: `${vf * 12.5}%`,
        top: `${vr * 12.5}%`,
        width: "12.5%",
        height: "12.5%",
        zIndex: vr + 2 + (selected ? 8 : 0),
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[6%] left-1/2 z-0 h-[22%] w-[70%] -translate-x-1/2 rounded-[50%]"
        style={{
          background:
            piece.color === "w"
              ? "radial-gradient(circle, color-mix(in oklab, var(--color-ivory) 55%, transparent), transparent 72%)"
              : "radial-gradient(circle, color-mix(in oklab, var(--color-ember) 50%, transparent), transparent 72%)",
        }}
      />
      <div
        className={cn(
          "piece-billboard absolute inset-x-0 bottom-0 z-[1] flex h-[108%] items-end justify-center",
          selected && "is-selected",
          landing && "is-landing",
        )}
      >
        <img
          key={landing ? landKey : piece.id}
          src={factionSrc(faction, piece.type)}
          alt={label}
          draggable={false}
          onError={(e) => {
            const el = e.currentTarget;
            if (el.dataset.fallback) return;
            el.dataset.fallback = "1";
            el.src = `/sets/sigil/${piece.color}-${piece.type}.svg?v=3`;
          }}
          className={cn(
            "block select-none",
            glyph ? "piece-glyph h-[92%] w-auto object-contain" : "piece-statue w-auto object-contain object-bottom",
            piece.color === "w" ? "is-white" : "is-black",
            selected && "brightness-110",
          )}
          style={
            glyph
              ? { width: `${sized}%`, maxHeight: "96%" }
              : { height: `${Math.min(sized, 128)}%`, width: "auto", maxWidth: "240%" }
          }
        />
      </div>
    </div>
  );
}
