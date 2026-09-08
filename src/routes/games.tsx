import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFaction, tableName } from "@/lib/chess/catalog";
import { hostKey } from "@/lib/chess/net";
import { fetchMyGames, useProfile, type GameRow } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/games")({
  component: MyGamesPage,
});

function formatAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function MyGamesPage() {
  const nav = useNavigate();
  const { profile, loading: seatLoading } = useProfile();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (seatLoading) return;
    if (!profile) {
      setLoading(false);
      setGames([]);
      return;
    }
    let alive = true;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchMyGames();
        if (alive) setGames(data.games);
      } catch (error) {
        if (alive) setErr(error instanceof Error ? error.message : "Could not load games");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile, seatLoading]);

  function reopen(game: GameRow) {
    const room = game.room.toUpperCase();
    // Restore host flag so orientation / white seat match the saved side.
    if (game.mySide === "w" || game.whiteProfileId === profile?.id) {
      localStorage.setItem(hostKey(room), "1");
    } else {
      localStorage.removeItem(hostKey(room));
    }
    const search: Record<string, string> = {
      w: game.wFaction,
      board: game.board,
    };
    if (game.bFaction) search.b = game.bFaction;
    if (game.clockLimitSec && game.clockLimitSec > 0) {
      search.clock = String(game.clockLimitSec);
    }
    if (game.challenge === "live" || game.challenge === "later") {
      search.kind = game.challenge;
    }
    void nav({ to: "/r/$code", params: { code: room }, search });
  }

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.22em] text-gold">Table</p>
            <h1 className="font-display text-3xl leading-none">My games</h1>
          </div>
          <Link to="/standings" className="text-xs text-gold underline-offset-2 hover:underline">
            Standings
          </Link>
        </header>

        <p className="text-sm text-pretty text-muted">
          Open duels and seat challenges. A challenge from the standings shows up here — open Sanctum from the icon,
          no link.
        </p>

        {seatLoading || loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !profile ? (
          <section className="panel rounded-[24px] p-4 text-sm text-muted">
            <Link to="/profile" className="text-gold underline-offset-2 hover:underline">
              Claim a seat
            </Link>{" "}
            to keep slow or concurrent duels.
          </section>
        ) : err ? (
          <p className="text-sm text-ember">{err}</p>
        ) : games.length === 0 ? (
          <section className="panel rounded-[24px] p-4 text-sm text-muted">
            No open duels. Start a linked game from home — End turn saves progress when you&apos;re signed in.
          </section>
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map((g) => {
              const w = getFaction(g.wFaction);
              const b = g.bFaction ? getFaction(g.bFaction) : null;
              const challenge = g.ply <= 0 && !g.bFaction;
              const liveWait = challenge && g.challenge === "live";
              const title = b
                ? tableName(w, b)
                : liveWait && g.mySide === "b"
                  ? `${w.name} · live call`
                  : challenge && g.mySide === "b"
                    ? `${w.name} challenged you`
                    : w.name;
              const turn = g.fen.split(" ")[1] === "b" ? "Black" : "White";
              const sideLabel =
                liveWait && g.mySide === "b"
                  ? "Sit now"
                  : challenge && g.mySide === "b"
                    ? "Pick your army"
                    : challenge
                      ? g.challenge === "live"
                        ? "Waiting for them to accept"
                        : "Waiting for them"
                      : g.mySide === "b"
                        ? "You · black"
                        : "You · white";
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => reopen(g)}
                    className={cn(
                      "panel flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left",
                    )}
                  >
                    <span className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-bg/50 text-gold">
                      <Swords className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{title}</p>
                      <p className="text-[11px] text-muted">
                        {g.room} · ply {g.ply} · {turn} to move · {sideLabel}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-dim">
                        {formatAgo(g.updatedAt)}
                      </p>
                    </div>
                    <span className="text-xs text-gold">
                      {challenge && g.mySide === "b" ? "Sit" : "Open"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="ghost" className="w-full" onClick={() => void nav({ to: "/" })}>
          Back home
        </Button>
      </div>
    </main>
  );
}
