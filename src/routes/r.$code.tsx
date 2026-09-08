import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/chess/Game";
import { hostKey, parseTable, peerKey } from "@/lib/chess/net";

export const Route = createFileRoute("/r/$code")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { w?: string; b?: string; board?: string; open?: string; clock?: string; seat?: string; kind?: string } => ({
    ...(typeof raw.w === "string" ? { w: raw.w } : {}),
    ...(typeof raw.b === "string" ? { b: raw.b } : {}),
    ...(typeof raw.board === "string" ? { board: raw.board } : {}),
    ...(typeof raw.open === "string" ? { open: raw.open } : {}),
    ...(typeof raw.clock === "string" ? { clock: raw.clock } : {}),
    ...(typeof raw.seat === "string" ? { seat: raw.seat } : {}),
    ...(typeof raw.kind === "string" ? { kind: raw.kind } : {}),
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const search = Route.useSearch();
  const room = code.toUpperCase();
  const [host, setHost] = useState(false);
  const [selfId, setSelfId] = useState<string>();
  const invite = parseTable(search);
  const clockSec = (() => {
    const n = Number(search.clock);
    return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.floor(n)) : 0;
  })();

  useEffect(() => {
    setHost(localStorage.getItem(hostKey(room)) === "1");
    const k = peerKey(room);
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = `p-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(k, id);
    }
    setSelfId(id);
  }, [room]);

  if (!selfId) {
    return <div className="min-h-dvh bg-bg" />;
  }

  return (
    <Game
      mode="online"
      room={room}
      host={host}
      selfId={selfId}
      invite={invite}
      clockSec={clockSec}
      inviteSeat={typeof search.seat === "string" ? search.seat : undefined}
      inviteKind={search.kind === "live" || search.kind === "later" ? search.kind : undefined}
    />
  );
}
