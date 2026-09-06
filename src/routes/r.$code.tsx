import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/chess/Game";
import { hostKey, peerKey } from "@/lib/chess/net";

export const Route = createFileRoute("/r/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const room = code.toUpperCase();
  const [host, setHost] = useState(false);
  const [selfId, setSelfId] = useState<string>();

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

  return <Game mode="online" room={room} host={host} selfId={selfId} />;
}
