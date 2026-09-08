import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Swords, Smartphone, Users } from "lucide-react";
import { HeroLineup } from "@/components/chess/HeroLineup";
import { Button } from "@/components/ui/button";
import { hostKey } from "@/lib/chess/net";
import { AI_LEVELS, warmOpponent, type AiLevelId } from "@/lib/chess/opponent";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

type Panel = null | "ai" | "start" | "join";

function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [aiClock, setAiClock] = useState(300);
  const CLOCK_OPTS: { sec: number; label: string; blurb: string }[] = [
    { sec: 0, label: "No clock", blurb: "Open table" },
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
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-bg/80 via-bg/25 to-transparent px-5 pb-16 pt-[max(3.2rem,env(safe-area-inset-top))] text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-gold">A table of hosts</p>
          <h1 className="font-display mt-1 text-5xl leading-none sm:text-7xl">Sanctum</h1>
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
              <Swords className="size-4" /> Play the table
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
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">Host strength</p>
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
              <Smartphone className="size-4" /> Start a duel
            </Button>
            {panel === "start" && (
              <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-bg/60 p-3">
                <p className="text-sm text-pretty text-muted">
                  Only <span className="text-fg">one</span> phone starts. Next you’ll pick your army, then send the
                  invite. They tap <span className="text-fg">Join a duel</span>.
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

            <Button size="lg" variant="ghost" className="w-full" onClick={() => toggle("join")}>
              <ArrowRight className="size-4" /> Join a duel
            </Button>
            {panel === "join" && (
              <form
                onSubmit={joinDuel}
                className="flex flex-col gap-2 rounded-[20px] border border-border bg-bg/60 p-3"
              >
                <p className="text-sm text-pretty text-muted">
                  Paste the room code they shared — or open their link. Don’t tap Start on this phone.
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
