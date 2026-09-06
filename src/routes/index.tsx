import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Swords, Smartphone, Users } from "lucide-react";
import { ArmyPick, ArmyRoster } from "@/components/chess/ArmyPick";
import { Button } from "@/components/ui/button";
import { BOARD_THEMES, getFaction } from "@/lib/chess/catalog";
import { hostKey, makeRoomCode } from "@/lib/chess/net";
import { AI_LEVELS, warmOpponent, type AiLevelId } from "@/lib/chess/opponent";
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
  const heroSrc = `/sets/${w.dir}/${w.file}-k.${w.ext}`;
  const [code, setCode] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  function playAi(lvl: AiLevelId) {
    warmOpponent();
    void nav({ to: "/play", search: { vs: "ai", lvl } });
  }

  function challenge() {
    const room = makeRoomCode();
    localStorage.setItem(hostKey(room), "1");
    void nav({
      to: "/r/$code",
      params: { code: room },
      search: { w: prefs.wFaction, board: prefs.boardId, open: "1" },
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
        style={{ ["--hero" as string]: `url(${heroSrc})` }}
      >
        <p className="text-xs uppercase tracking-[0.28em] text-gold">A table of hosts</p>
        <h1 className="font-display mt-2 max-w-xl text-5xl leading-[0.9] text-balance sm:mt-3 sm:text-7xl">
          Sanctum
        </h1>
        <p className="font-display mt-2 text-xl leading-none text-ivory sm:mt-3 sm:text-3xl">
          You sit as {w.name}
        </p>
        <p className="mt-3 max-w-md text-pretty text-sm text-muted sm:mt-4 sm:text-base">
          Pick your army and inspect every rank. Challenge a phone — they choose theirs. Or sit the table against a host of four strengths.
        </p>

        <div className="mt-4 flex max-w-md flex-col gap-2 sm:mt-6 sm:gap-3">
          <Button size="lg" className="w-full" onClick={() => nav({ to: "/play" })}>
            <Users className="size-4" /> Pass and play
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setAiOpen((v) => !v);
              warmOpponent();
            }}
          >
            <Swords className="size-4" /> Play the table
          </Button>
          {aiOpen && (
            <div className="grid grid-cols-2 gap-2">
              {AI_LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => playAi(l.id)}
                  className="rounded-[16px] border border-border bg-bg/50 px-3 py-2 text-left"
                >
                  <span className="font-display block text-lg leading-none">{l.name}</span>
                  <span className="mt-1 block text-xs text-muted">{l.blurb}</span>
                </button>
              ))}
            </div>
          )}
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
        <ArmyPick
          kicker="Your host"
          note="Tap an army to see king, queen, rook, bishop, knight, and pawn — not a paired set."
          selected={prefs.wFaction}
          onSelect={(id) => prefs.setWFaction(id)}
        />

        <div className="mt-12">
          <ArmyPick
            kicker="If they sit this screen too"
            note="Pass and play uses this throne as black. A challenged phone picks their own."
            selected={prefs.bFaction}
            onSelect={(id) => prefs.setBFaction(id)}
          />
        </div>

        <p className="mt-10 text-xs uppercase tracking-[0.22em] text-muted">Boards</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BOARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => prefs.setBoardId(theme.id)}
              className={cn(
                "overflow-hidden rounded-[20px] border",
                prefs.boardId === theme.id ? "border-ivory" : "border-border",
              )}
            >
              <span
                className="block h-16 w-full"
                style={{
                  backgroundImage: theme.light && theme.dark ? `url(${theme.dark})` : undefined,
                  backgroundColor: "#1c1814",
                  backgroundSize: "cover",
                }}
              />
              <span className="block px-2 py-2 text-left text-xs font-medium">{theme.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 pb-16">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">{w.name}</p>
        <h2 className="font-display mt-2 text-3xl">Every rank, this throne</h2>
        <p className="mt-2 max-w-lg text-sm text-muted">The six that will stand for you.</p>
        <div className="mt-6 panel rounded-[24px] px-3 py-5 sm:px-5">
          <ArmyRoster faction={w} size="lg" />
        </div>
        <p className="mt-10 text-xs uppercase tracking-[0.22em] text-muted">{b.name} · pass and play</p>
        <div className="mt-4 panel rounded-[24px] px-3 py-5 sm:px-5">
          <ArmyRoster faction={b} size="lg" />
        </div>
      </section>
    </main>
  );
}
