import { HERO_LINEUP, PIECE_LABEL, factionSrc, getFaction } from "@/lib/chess/catalog";

export function HeroLineup() {
  return (
    <div className="hero-line" aria-hidden>
      <div className="hero-dais">
        {HERO_LINEUP.map((seat, i) => {
          const f = getFaction(seat.faction);
          return (
            <figure key={`${f.id}-${seat.type}`} className="hero-figure" style={{ zIndex: 2 + (i === 1 || i === 2 ? 2 : 0) }}>
              <img
                src={factionSrc(f, seat.type)}
                alt=""
                className="hero-statue"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.dataset.fallback) return;
                  el.dataset.fallback = "1";
                  el.src = `/sets/sigil/${f.file}-${seat.type}.svg?v=3`;
                }}
              />
              <figcaption>
                <span className="hero-fig-name">{f.name}</span>
                <span className="hero-fig-rank">{PIECE_LABEL[seat.type]}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
