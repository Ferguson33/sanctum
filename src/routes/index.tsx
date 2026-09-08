import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Link2, Swords, Trophy, Users } from "lucide-react";
import { HeroLineup } from "@/components/chess/HeroLineup";
import { Button } from "@/components/ui/button";
import { factionSrc, getFaction, type PieceType } from "@/lib/chess/catalog";
import { hostKey } from "@/lib/chess/net";
import { AI_LEVELS, warmOpponent, type AiLevelId } from "@/lib/chess/opponent";
import { useProfile } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

type Panel = null | "ai" | "start" | "join";

function Home() {
  const nav = useNavigate();
  const { profile, loading: seatLoading } = useProfile();
  const [code, setCode] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [aiClock, setAiClock] = useState(300);
  const CLOCK_OPTS: { sec: number; label: string; blurb: string }[] = [
    { sec: 0, label: "No clock", blurb: "Untimed" },
    { sec: 180, label: "3 min", blurb: "Each side" },
    { sec: 300, label: "5 min", blurb: "Each side" },
    { sec: 600, label: "10 min", blurb: "Each side" },
  ];

  function toggle(next: Panel) {
    setPanel((cur) => (cur === next ? null : next));
    if (next === "ai") warmOpponent();
  }

  function goSetupAi(lvl: AiLevelId) {
    warmOpponent();
    void nav({
      to: "/setup",
      search: {
        mode: "ai",
        lvl,
        ...(aiClock > 0 ? { clock: String(aiClock) } : {}),
      },
    });
  }

  function goSetupDuel(clockSec: number) {
    void nav({
      to: "/setup",
      search: {
        mode: "duel",
        ...(clockSec > 0 ? { clock: String(clockSec) } : {}),
      },
    });
  }

  function joinDuel(e: FormEvent) {
    e.preventDefault();
    const room = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (room.length < 4) return;
    localStorage.removeItem(hostKey(room));
    void nav({ to: "/r/$code", params: { code: room }, search: {} });
  }

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <section className="relative h-dvh overflow-hidden">
        <div aria-hidden className="arena-wash absolute inset-0" />
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-bg/80 via-bg/25 to-transparent px-5 pb-16 pt-[max(3.2rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col items-end gap-1.5 sm:right-5">
            <Link
              to="/profile"
              className="flex max-w-[11rem] items-center gap-2 rounded-full border border-border bg-bg/70 px-2.5 py-1.5 text-left backdrop-blur-sm"
            >
              {profile ? (
                <>
                  <img
                    src={factionSrc(
                      getFaction(profile.crestFaction),
                      profile.crestPiece as PieceType,
                    )}
                    alt=""
                    className="h-7 w-5 object-contain object-bottom"
                  />
                  <span className="truncate text-xs font-medium">{profile.displayName}</span>
                </>
              ) : (
                <span className="px-1 text-xs text-gold">
                  {seatLoading ? "…" : "Claim seat"}
                </span>
              )}
            </Link>
            <Link
              to="/standings"
              className="text-[10px] uppercase tracking-[0.18em] text-muted underline-offset-2 hover:text-gold hover:underline"
            >
              Standings
            </Link>
            {profile ? (
              <Link
                to="/games"
                className="text-[10px] uppercase tracking-[0.18em] text-muted underline-offset-2 hover:text-gold hover:underline"
              >
                My games
              </Link>
            ) : null}
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-gold">Cinematic chess</p>
            <h1 className="font-display mt-1 text-5xl leading-none sm:text-7xl">Sanctum</h1>
          </div>
        </header>
        <HeroLineup />
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg via-bg/80 to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => nav({ to: "/setup", search: { mode: "local" } })}
            >
              <Users className="size-4" /> Pass and play
            </Button>
            <Button size="lg" variant="ghost" className="w-full" onClick={() => toggle("ai")}>
              <Swords className="size-4" /> Play AI
            </Button>
            {panel === "ai" && (
              <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-bg/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Clock</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CLOCK_OPTS.map((c) => (
                    <button
                      key={`ai-${c.sec}`}
                      type="button"
                      onClick={() => setAiClock(c.sec)}
                      className={cn(
                        "rounded-[14px] border px-2 py-2 text-center",
                        aiClock === c.sec ? "border-ivory bg-bg/70" : "border-border bg-bg/50",
                      )}
                    >
                      <span className="block text-xs font-medium leading-none">{c.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">AI strength</p>
                <div className="grid grid-cols-2 gap-2">
                  {AI_LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => goSetupAi(l.id)}
                      className="rounded-[16px] border border-border bg-bg/50 px-3 py-2 text-left"
                    >
                      <span className="font-display block text-lg leading-none">{l.name}</span>
                      <span className="mt-1 block text-xs text-muted">{l.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button size="lg" variant="ghost" className="w-full" onClick={() => toggle("start")}>
              <Link2 className="size-4" /> Invite a guest
            </Button>
            {panel === "start" && (
              <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-bg/60 p-3">
                <p className="text-sm text-pretty text-muted">
                  Sends a <span className="text-fg">link</span>. For someone who doesn’t have a seat yet. You pick
                  your army, they open the link (or type the code).
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Clock</p>
                <div className="grid grid-cols-2 gap-2">
                  {CLOCK_OPTS.map((c) => (
                    <button
                      key={c.sec}
                      type="button"
                      onClick={() => goSetupDuel(c.sec)}
                      className="rounded-[16px] border border-border bg-bg/50 px-3 py-2 text-left"
                    >
                      <span className="font-display block text-lg leading-none">{c.label}</span>
                      <span className="mt-1 block text-xs text-muted">{c.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={() => {
                if (!profile) {
                  void nav({ to: "/profile" });
                  return;
                }
                void nav({ to: "/standings" });
              }}
            >
              <Trophy className="size-4" /> Duel a seat
            </Button>

            <Button size="lg" variant="ghost" className="w-full" onClick={() => toggle("join")}>
              <ArrowRight className="size-4" /> Enter a code
            </Button>
            {panel === "join" && (
              <form
                onSubmit={joinDuel}
                className="flex flex-col gap-2 rounded-[20px] border border-border bg-bg/60 p-3"
              >
                <p className="text-sm text-pretty text-muted">
                  Guest of a link: paste the room code. Don’t invite from this phone.
                </p>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Room code"
                    maxLength={8}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    className="h-12 flex-1 rounded-[14px] border border-border bg-surface px-4 text-sm tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-dim focus:border-ivory"
                  />
                  <Button type="submit" size="lg" disabled={code.replace(/[^a-zA-Z0-9]/g, "").length < 4}>
                    Join
                  </Button>
                </div>
              </form>
            )}

          </div>
        </div>
      </section>
    </main>
  );
}
