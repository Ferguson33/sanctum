import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getFaction } from "@/lib/chess/catalog";
import { hostKey } from "@/lib/chess/net";
import { fetchMyGames, finishGameClient, useProfile, type GameRow } from "@/lib/profile/client";

function isLiveOpen(g: GameRow, selfId: string): boolean {
  if (g.status !== "open" || g.challenge !== "live") return false;
  if (g.mySide !== "b" && g.blackProfileId !== selfId) return false;
  if (g.ply > 0 || g.bFaction) return false;
  if (!g.expiresAt) return true;
  const t = Date.parse(g.expiresAt);
  return !Number.isFinite(t) || t > Date.now();
}

export function IncomingChallenge() {
  const { profile } = useProfile();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [live, setLive] = useState<GameRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile?.id) {
      setLive(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const { games } = await fetchMyGames();
        if (!alive) return;
        const hit = games.find((g) => isLiveOpen(g, profile.id)) ?? null;
        setLive(hit);
      } catch {
        if (alive) setLive(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [profile?.id]);

  if (!live || !profile) return null;
  const inThisRoom = pathname.toUpperCase().includes(`/R/${live.room.toUpperCase()}`);
  if (inThisRoom) return null;

  const hostArmy = getFaction(live.wFaction).name;
  const mins = live.clockLimitSec && live.clockLimitSec > 0 ? Math.round(live.clockLimitSec / 60) : 0;

  function accept() {
    const room = live.room.toUpperCase();
    localStorage.removeItem(hostKey(room));
    const search: Record<string, string> = { w: live.wFaction, board: live.board, open: "1", kind: "live" };
    if (live.clockLimitSec && live.clockLimitSec > 0) search.clock = String(live.clockLimitSec);
    void nav({ to: "/r/$code", params: { code: room }, search });
  }

  async function decline() {
    setBusy(true);
    try {
      await finishGameClient(live.room);
    } catch {
      /* */
    }
    setLive(null);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-bg/70 p-4 pb-[max(1.2rem,env(safe-area-inset-bottom))] sm:items-center">
      <div className="panel w-full max-w-sm rounded-[28px] p-5 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-gold">Live duel</p>
        <p className="font-display mt-1 text-3xl leading-none">{hostArmy} called you</p>
        <p className="mt-2 text-sm text-muted text-pretty">
          They’re at the table now
          {mins ? ` · ${mins} min each` : " · no clock"}. Accept only if you’re here.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => void decline()} disabled={busy}>
            Not now
          </Button>
          <Button className="flex-1" onClick={accept} disabled={busy}>
            Sit down
          </Button>
        </div>
      </div>
    </div>
  );
}
