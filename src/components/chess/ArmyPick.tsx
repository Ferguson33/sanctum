import { useState } from "react";
import {
  FACTIONS,
  PIECE_CARD,
  PIECE_LABEL,
  type Faction,
  type PieceType,
  factionSrc,
  getFaction,
} from "@/lib/chess/catalog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INSPECT: PieceType[] = ["k", "q", "r", "b", "n", "p"];

function pieceImg(faction: Faction, type: PieceType, className: string) {
  return (
    <img
      src={factionSrc(faction, type)}
      alt={`${faction.name} ${PIECE_LABEL[type]}`}
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fallback) return;
        el.dataset.fallback = "1";
        el.src = `/sets/sigil/${faction.file}-${type}.svg?v=3`;
      }}
    />
  );
}

export function ArmyRoster({
  faction,
  size = "md",
  onOpen,
}: {
  faction: Faction;
  size?: "sm" | "md" | "lg";
  onOpen?: (type: PieceType) => void;
}) {
  const h = size === "lg" ? "h-24 sm:h-28" : size === "sm" ? "h-11 sm:h-14" : "h-[4.5rem] sm:h-20";
  return (
    <div className="grid grid-cols-6 gap-1 sm:gap-2">
      {INSPECT.map((t) => {
        const body = (
          <>
            {pieceImg(faction, t, cn(h, "w-auto max-w-full object-contain object-bottom"))}
            <figcaption className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
              {PIECE_LABEL[t]}
            </figcaption>
          </>
        );
        if (!onOpen) {
          return (
            <figure key={t} className="flex flex-col items-center">
              {body}
            </figure>
          );
        }
        return (
          <button
            key={t}
            type="button"
            onClick={() => onOpen(t)}
            className="flex flex-col items-center rounded-[14px] px-0.5 py-1 hover:bg-ivory/5"
            aria-label={`${faction.name} ${PIECE_LABEL[t]}`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function RankCard({
  faction,
  type,
  onClose,
  onPrev,
  onNext,
}: {
  faction: Faction;
  type: PieceType;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-bg/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-sm rounded-[28px] px-5 pb-5 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.22em] text-gold">{faction.name}</p>
        <p className="font-display mt-1 text-4xl leading-none">{PIECE_LABEL[type]}</p>
        <p className="mt-1 text-sm text-muted">{faction.epithet}</p>
        <div className="mt-4 flex h-[42vh] max-h-80 items-end justify-center">
          {pieceImg(faction, type, "h-full w-auto max-w-full object-contain object-bottom")}
        </div>
        <p className="mt-4 text-sm text-pretty text-muted">{PIECE_CARD[type]}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="subtle" className="flex-1" onClick={onPrev}>
            Prev
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button variant="subtle" className="flex-1" onClick={onNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ArmyPick({
  kicker,
  selected,
  onSelect,
  onSit,
  sitLabel,
  note,
  taken,
}: {
  kicker: string;
  selected: string;
  onSelect: (id: string) => void;
  onSit?: () => void;
  sitLabel?: string;
  note?: string;
  /** Army already chosen — not offered to the other side. */
  taken?: string;
}) {
  const faction = getFaction(selected);
  const [card, setCard] = useState<PieceType | null>(null);

  function step(dir: -1 | 1) {
    if (!card) return;
    const i = INSPECT.indexOf(card);
    setCard(INSPECT[(i + dir + INSPECT.length) % INSPECT.length]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-gold">{kicker}</p>
        {note ? <p className="mt-1 text-sm text-muted text-pretty">{note}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FACTIONS.map((f) => {
          const sat = taken === f.id;
          return (
            <button
              key={f.id}
              type="button"
              disabled={sat}
              onClick={() => onSelect(f.id)}
              className={cn(
                "flex flex-col items-center rounded-[20px] border px-1 py-3",
                sat && "cursor-not-allowed opacity-35",
                !sat && selected === f.id ? "border-ivory bg-surface" : "border-border bg-surface/40",
              )}
            >
              {pieceImg(f, "k", "h-12 w-auto sm:h-14 object-contain object-bottom")}
              <span className="mt-2 text-xs font-medium">{sat ? "Taken" : f.name}</span>
            </button>
          );
        })}
      </div>
      <div className="panel rounded-[24px] px-3 py-4 sm:px-4">
        <p className="font-display text-3xl leading-none">{faction.name}</p>
        <p className="mt-1 text-sm text-muted">{faction.epithet}</p>
        <p className="mt-2 text-xs text-dim">Tap a rank to open its card.</p>
        <div className="mt-4">
          <ArmyRoster faction={faction} onOpen={setCard} />
        </div>
      </div>
      {onSit ? (
        <Button size="lg" className="w-full" onClick={onSit}>
          {sitLabel ?? `Play as ${faction.name}`}
        </Button>
      ) : null}
      {card ? (
        <RankCard
          faction={faction}
          type={card}
          onClose={() => setCard(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      ) : null}
    </div>
  );
}
