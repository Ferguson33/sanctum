/**
 * Turn-based room bus over /api/rtc. Chess does not need WebRTC — two phones
 * publish hellos and moves to a shared mailbox and poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerInfo } from "./p2p";
import type { P2PRoomHandle } from "./use-p2p-room";

interface Options {
  room: string;
  name?: string;
  selfId?: string;
  enabled?: boolean;
}

export function useRoomBus(options: Options): P2PRoomHandle {
  const enabled = options.enabled ?? true;
  const [selfId] = useState(
    () => options.selfId ?? `p-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [room] = useState(() => options.room);
  const [name] = useState(() => options.name ?? selfId);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [table, setTable] = useState<{ w: string; b: string; board: string } | null>(null);
  const cursor = useRef("0");
  const seen = useRef(new Set<string>());
  const closed = useRef(false);
  const listeners = useRef(
    new Set<(from: string, data: unknown, channel: "state" | "reliable") => void>(),
  );

  useEffect(() => {
    if (!enabled) return;
    closed.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const emit = (from: string, data: unknown) => {
      for (const fn of listeners.current) fn(from, data, "reliable");
    };

    const poll = async () => {
      if (closed.current) return;
      try {
        const params = new URLSearchParams({
          room,
          peer: selfId,
          name,
          since: cursor.current,
        });
        const res = await fetch(`/api/rtc?${params}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          peers?: { id: string; name: string }[];
          messages?: { id: string; from: string; payload: unknown }[];
          table?: { w: string; b: string; board: string };
        };
        setJoined(true);
        setPeers(
          (body.peers ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            connectionState: "connected",
            candidateType: "relay",
            rttMs: null,
          })),
        );
        if (body.table) setTable(body.table);
        for (const msg of body.messages ?? []) {
          cursor.current = msg.id;
          if (seen.current.has(msg.id)) continue;
          seen.current.add(msg.id);
          if (msg.from === selfId) continue;
          if (msg.payload && typeof msg.payload === "object" && (msg.payload as { t?: string }).t === "hello") {
            continue;
          }
          emit(msg.from, msg.payload);
        }
      } catch {
        // next tick retries
      }
      if (!closed.current) timer = setTimeout(() => void poll(), 900);
    };

    const hello = async () => {
      if (closed.current) return;
      await fetch("/api/rtc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "pub",
          room,
          from: selfId,
          payload: { t: "hello", id: selfId, name },
        }),
      }).catch(() => {});
    };

    void hello();
    void poll();
    const beat = setInterval(() => void hello(), 5000);
    return () => {
      closed.current = true;
      if (timer) clearTimeout(timer);
      clearInterval(beat);
    };
  }, [enabled, room, selfId, name]);

  const send = useCallback(
    (data: unknown) => {
      void fetch("/api/rtc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "pub", room, from: selfId, payload: data }),
      }).catch(() => {});
    },
    [room, selfId],
  );

  const onMessage = useCallback(
    (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => {
      listeners.current.add(fn);
      return () => {
        listeners.current.delete(fn);
      };
    },
    [],
  );

  return {
    selfId,
    room,
    peers,
    joined,
    table,
    broadcast: send,
    send,
    onMessage,
  };
}
