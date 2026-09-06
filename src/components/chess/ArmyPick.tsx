import {
  FACTIONS,
  PIECE_LABEL,
  type Faction,
  type PieceType,
  factionSrc,
  getFaction,
} from "@/lib/chess/catalog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INSPECT: PieceType[] = ["k", "q", "r", "b", "n", "p"];

export function ArmyRoster({
  faction,
  size = "md",
}: {
  faction: Faction;
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "lg" ? "h-24 sm:h-28" : size === "sm" ? "h-11 sm:h-14" : "h-[4.5rem] sm:h-20";
  return (
    <div className="grid grid-cols-6 gap-1 sm:gap-2">
      {INSPECT.map((t) => (
        <figure key={t} className="flex flex-col items-center">
          <img
            src={factionSrc(faction, t)}
            alt={`${faction.name} ${PIECE_LABEL[t]}`}
            className={cn(h, "w-auto object-contain object-bottom")}
            onError={(e) => {
              const el = e.currentTarget;
              if (el.dataset.fallback) return;
              el.dataset.fallback = "1";
              el.src = `/sets/sigil/${faction.file}-${t}.svg?v=3`;
            }}
          />
          <figcaption className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            {PIECE_LABEL[t]}
          </figcaption>
        </figure>
      ))}
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
}: {
  kicker: string;
  selected: string;
  onSelect: (id: string) => void;
  onSit?: () => void;
  sitLabel?: string;
  note?: string;
}) {
  const faction = getFaction(selected);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-gold">{kicker}</p>
        {note ? <p className="mt-1 text-sm text-muted text-pretty">{note}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FACTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            className={cn(
              "flex flex-col items-center rounded-[20px] border px-1 py-3",
              selected === f.id ? "border-ivory bg-surface" : "border-border bg-surface/40",
            )}
          >
            <img
              src={factionSrc(f, "k")}
              alt=""
              className="h-12 w-auto sm:h-14"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.dataset.fallback) return;
                el.dataset.fallback = "1";
                el.src = `/sets/sigil/${f.file}-k.svg?v=3`;
              }}
            />
            <span className="mt-2 text-xs font-medium">{f.name}</span>
          </button>
        ))}
      </div>
      <div className="panel rounded-[24px] px-3 py-4 sm:px-4">
        <p className="font-display text-3xl leading-none">{faction.name}</p>
        <p className="mt-1 text-sm text-muted">{faction.epithet}</p>
        <div className="mt-4">
          <ArmyRoster faction={faction} />
        </div>
      </div>
      {onSit ? (
        <Button size="lg" className="w-full" onClick={onSit}>
          {sitLabel ?? `Sit as ${faction.name}`}
        </Button>
      ) : null}
    </div>
  );
}
