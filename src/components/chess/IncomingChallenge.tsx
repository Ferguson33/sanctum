import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getFaction } from "@/lib/chess/catalog";
import { hostKey } from "@/lib/chess/net";
import { fetchMyGames, finishGameClient, useProfile, type GameRow } from "@/lib/profile/client";

function isIncoming(g: GameRow, selfId: string): boolean {
  if (g.status !== "open") return false;
  if (g.mySide !== "b" && g.blackProfileId !== selfId) return false;
  if (g.ply > 0 || g.bFaction) return false;
  if (g.challenge === "live") {
    if (!g.expiresAt) return true;
    const t = Date.parse(g.expiresAt);
    return !Number.isFinite(t) || t > Date.now();
  }
  return g.challenge === "later" || !g.challenge;
}

export function joinChallengeSearch(g: GameRow): Record<string, string> {
  const search: Record<string, string> = { w: g.wFaction, board: g.board, open: "1" };
  if (g.clockLimitSec && g.clockLimitSec > 0) search.clock = String(g.clockLimitSec);
  if (g.challenge === "live" || g.challenge === "later") search.kind = g.challenge;
  return search;
}

export function openChallenge(
  g: GameRow,
  nav: ReturnType<typeof useNavigate>,
) {
  const room = g.room.toUpperCase();
  localStorage.removeItem(hostKey(room));
  void nav({ to: "/r/$code", params: { code: room }, search: joinChallengeSearch(g) });
}

export function useIncomingGames() {
  const { profile } = useProfile();
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    if (!profile?.id) {
      setGames([]);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const { games: rows } = await fetchMyGames();
        if (!alive) return;
        setGames(rows.filter((g) => isIncoming(g, profile.id)));
      } catch {
        if (alive) setGames([]);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [profile?.id]);

  const live = games.find((g) => g.challenge === "live") ?? null;
  const later = games.filter((g) => g.challenge !== "live");
  return { profile, live, later, incoming: live ?? later[0] ?? null };
}

function who(g: GameRow): string {
  return g.whiteName?.trim() || getFaction(g.wFaction).name;
}

export function IncomingChallenge() {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { incoming, live } = useIncomingGames();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);

  if (!incoming) return null;
  const inThisRoom = pathname.toUpperCase().includes(`/R/${incoming.room.toUpperCase()}`);
  if (inThisRoom) return null;
  if (hidden === incoming.id) return null;

  const mins = incoming.clockLimitSec && incoming.clockLimitSec > 0 ? Math.round(incoming.clockLimitSec / 60) : 0;
  const isLive = incoming.challenge === "live" || live?.id === incoming.id;

  async function decline() {
    if (!isLive) {
      setHidden(incoming.id);
      return;
    }
    setBusy(true);
    try {
      await finishGameClient(incoming.room);
    } catch {
      /* */
    }
    setBusy(false);
    setHidden(incoming.id);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[max(0.55rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto panel flex w-full max-w-md items-center gap-2 rounded-[18px] px-3 py-2.5 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
            {isLive ? "Game request" : "Waiting"}
          </p>
          <p className="truncate text-sm font-medium">
            {who(incoming)}
            {isLive ? (mins ? ` · ${mins} min` : " · live") : " · join when ready"}
          </p>
        </div>
        {isLive ? (
          <Button variant="ghost" size="sm" onClick={() => void decline()} disabled={busy}>
            Not now
          </Button>
        ) : null}
        <Button size="sm" onClick={() => openChallenge(incoming, nav)} disabled={busy}>
          Join
        </Button>
      </div>
    </div>
  );
}
