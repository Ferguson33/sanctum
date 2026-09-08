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

function isYourMove(g: GameRow, selfId: string): boolean {
  if (g.status !== "open") return false;
  if (!g.bFaction && g.ply <= 0) return false;
  const turn = g.fen.split(" ")[1] === "b" ? "b" : "w";
  const mine = g.mySide ?? (g.whiteProfileId === selfId ? "w" : "b");
  return turn === mine;
}

export function joinChallengeSearch(g: GameRow): Record<string, string> {
  const search: Record<string, string> = { w: g.wFaction, board: g.board };
  if (g.bFaction) search.b = g.bFaction;
  else search.open = "1";
  if (g.clockLimitSec && g.clockLimitSec > 0) search.clock = String(g.clockLimitSec);
  if (g.challenge === "live" || g.challenge === "later") search.kind = g.challenge;
  return search;
}

export function openSavedGame(
  g: GameRow,
  nav: ReturnType<typeof useNavigate>,
  selfId?: string,
) {
  const room = g.room.toUpperCase();
  if (g.mySide === "w" || g.whiteProfileId === selfId) {
    localStorage.setItem(hostKey(room), "1");
  } else {
    localStorage.removeItem(hostKey(room));
  }
  void nav({ to: "/r/$code", params: { code: room }, search: joinChallengeSearch(g) });
}

export function openChallenge(g: GameRow, nav: ReturnType<typeof useNavigate>) {
  openSavedGame(g, nav);
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
        setGames(rows);
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

  const incoming =
    games.find((g) => profile && isIncoming(g, profile.id)) ?? null;
  const yourMove =
    games.find((g) => profile && isYourMove(g, profile.id)) ?? null;
  const later = games.filter((g) => g.challenge !== "live" && profile && isIncoming(g, profile.id));
  return { profile, live: incoming?.challenge === "live" ? incoming : null, later, incoming, yourMove };
}

function who(g: GameRow, selfId?: string): string {
  if (g.mySide === "w" || g.whiteProfileId === selfId) {
    return g.blackName?.trim() || (g.bFaction ? getFaction(g.bFaction).name : getFaction(g.wFaction).name);
  }
  return g.whiteName?.trim() || getFaction(g.wFaction).name;
}

export function IncomingChallenge() {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, incoming, live, yourMove } = useIncomingGames();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);

  const notice = incoming ?? yourMove;
  if (!notice || !profile) return null;
  const inThisRoom = pathname.toUpperCase().includes(`/R/${notice.room.toUpperCase()}`);
  if (inThisRoom) return null;
  if (hidden === notice.id) return null;
  if (pathname === "/games" && !incoming) return null;

  const mins = notice.clockLimitSec && notice.clockLimitSec > 0 ? Math.round(notice.clockLimitSec / 60) : 0;
  const isLive = Boolean(incoming && (incoming.challenge === "live" || live?.id === incoming.id));
  const isMove = !incoming && Boolean(yourMove);
  const room = notice.room;
  const noticeId = notice.id;

  async function decline() {
    if (!isLive) {
      setHidden(noticeId);
      return;
    }
    setBusy(true);
    try {
      await finishGameClient(room);
    } catch {
      /* */
    }
    setBusy(false);
    setHidden(noticeId);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[max(0.55rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto panel flex w-full max-w-md items-center gap-2 rounded-[18px] px-3 py-2.5 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
            {isLive ? "Game request" : isMove ? "Your move" : "Waiting"}
          </p>
          <p className="truncate text-sm font-medium">
            {who(notice, profile.id)}
            {isLive ? (mins ? ` · ${mins} min` : " · live") : isMove ? " · sit at My games" : " · join when ready"}
          </p>
        </div>
        {isLive ? (
          <Button variant="ghost" size="sm" onClick={() => void decline()} disabled={busy}>
            Not now
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => (isMove ? void nav({ to: "/games" }) : openSavedGame(notice, nav, profile.id))}
          disabled={busy}
        >
          {isMove ? "My games" : "Join"}
        </Button>
      </div>
    </div>
  );
}
