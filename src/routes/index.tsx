import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOARD_THEMES, FACTIONS, GALLERIES, PIECE_SETS, factionSrc, getFaction, pairingOf, tableName } from "@/lib/chess/catalog";
import { hostKey, makeRoomCode } from "@/lib/chess/net";
import { usePrefs } from "@/lib/chess/prefs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const nav = useNavigate();
  const prefs = usePrefs();
  const w = getFaction(prefs.wFaction);
  const b = getFaction(prefs.bFaction);
  const pair = pairingOf(w.id, b.id);
  const galleryKey = pair?.id ?? (w.family === "Grove" || b.family === "Grove" ? "grove" : w.family === "Sanctum" ? "sanctum" : "sigil");
  const gallery = GALLERIES[galleryKey] ?? GALLERIES.sigil;
  const hero = galleryKey === "grove" ? "/gallery/grove-k.jpg" : "/gallery/kings.jpg";
  const [code, setCode] = useState("");

  function challenge() {
    const room = makeRoomCode();
    localStorage.setItem(hostKey(room), "1");
    void nav({
      to: "/r/$code",
      params: { code: room },
      search: { w: prefs.wFaction, b: prefs.bFaction, board: prefs.boardId },
    });
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const room = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (room.length < 4) return;
    void nav({ to: "/r/$code", params: { code: room }, search: {} });
  }

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <section
        className="hero-wash relative flex min-h-dvh flex-col justify-end px-5 pb-6 pt-12 sm:pb-10 sm:pt-16"
        style={{ ["--hero" as string]: `url(${hero})` }}
      >
        <p className="text-xs uppercase tracking-[0.28em] text-gold">A table of hosts</p>
        <h1 className="font-display mt-2 max-w-xl text-5xl leading-[0.9] text-balance sm:mt-3 sm:text-7xl">
          Sanctum
        </h1>
        <p className="font-display mt-2 text-xl leading-none text-ivory sm:mt-3 sm:text-3xl">
          {w.name} vs {b.name}
        </p>
        <p className="mt-3 max-w-md text-pretty text-sm text-muted sm:mt-4 sm:text-base">
          Normal chess. Choose who sits white, who sits black — then pass the screen or send a code.
        </p>

        <div className="mt-4 flex max-w-lg gap-2 overflow-x-auto pb-1 sm:mt-6">
          {PIECE_SETS.map((s) => {
            const on = prefs.wFaction === s.w && prefs.bFaction === s.b;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => prefs.setSetId(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-[16px] border px-3 py-1.5 sm:py-2",
                  on ? "border-ivory bg-bg/70" : "border-border bg-bg/40",
                )}
              >
                <img src={factionSrc(getFaction(s.w), "k")} alt="" className="h-8 w-auto sm:h-10" />
                <img src={factionSrc(getFaction(s.b), "k")} alt="" className="h-8 w-auto sm:h-10" />
                <span className="font-display text-base leading-none sm:text-lg">{s.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex max-w-md flex-col gap-2 sm:mt-6 sm:gap-3">
          <Button size="lg" className="w-full" onClick={() => nav({ to: "/play" })}>
            <Users className="size-4" /> Pass and play
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={challenge}>
            <Smartphone className="size-4" /> Challenge a phone
          </Button>
          <form onSubmit={join} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Join with a code"
              maxLength={8}
              className="h-12 flex-1 rounded-[14px] border border-border bg-surface px-4 text-sm tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-dim focus:border-ivory"
            />
            <Button type="submit" variant="subtle" size="lg" aria-label="Join">
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      <section className="px-5 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Mix the thrones</p>
        <h2 className="font-display mt-2 text-3xl">White and black choose separately</h2>
        <p className="mt-2 max-w-lg text-sm text-muted">
          Pairings above are shortcuts. Sit Elves across from Evil, or Canon across from Dwarves — the rules do not change.
        </p>

        <p className="mt-8 text-xs uppercase tracking-[0.22em] text-muted">White plays as</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FACTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => prefs.setWFaction(f.id)}
              className={cn(
                "flex flex-col items-center rounded-[20px] border px-1 py-3",
                prefs.wFaction === f.id ? "border-ivory bg-surface" : "border-border bg-surface/40",
              )}
            >
              <img src={factionSrc(f, "k")} alt="" className="h-14 w-auto" loading="lazy" />
              <span className="mt-2 text-xs font-medium">{f.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-xs uppercase tracking-[0.22em] text-muted">Black plays as</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FACTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => prefs.setBFaction(f.id)}
              className={cn(
                "flex flex-col items-center rounded-[20px] border px-1 py-3",
                prefs.bFaction === f.id ? "border-ivory bg-surface" : "border-border bg-surface/40",
              )}
            >
              <img src={factionSrc(f, "k")} alt="" className="h-14 w-auto" loading="lazy" />
              <span className="mt-2 text-xs font-medium">{f.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-10 text-xs uppercase tracking-[0.22em] text-muted">Boards</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BOARD_THEMES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => prefs.setBoardId(b.id)}
              className={cn(
                "overflow-hidden rounded-[20px] border",
                prefs.boardId === b.id ? "border-ivory" : "border-border",
              )}
            >
              <span
                className="block h-16 w-full"
                style={{
                  backgroundImage:
                    b.light && b.dark ? `url(${b.dark})` : undefined,
                  backgroundColor: "#1c1814",
                  backgroundSize: "cover",
                }}
              />
              <span className="block px-2 py-2 text-left text-xs font-medium">{b.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 pb-16">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">The {tableName(w, b)} host</p>
        <h2 className="font-display mt-2 text-3xl">Every rank, two thrones</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {gallery.map((g) => (
            <figure key={g.src} className="overflow-hidden rounded-[20px] border border-border">
              <img src={g.src} alt={g.label} className="aspect-[3/2] w-full object-cover" loading="lazy" />
              <figcaption className="px-3 py-2 text-sm text-muted">{g.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
