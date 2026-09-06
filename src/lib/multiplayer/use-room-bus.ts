/**
 * Turn-based room bus. Phones publish hellos and moves straight to the
 * shared mailbox so a Vercel hop cannot drop the second ply.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  payloadKey,
  peersFrom,
  publishMailbox,
  readMailbox,
  sendWithRetry,
  tableFrom,
} from "./mailbox";
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
  const seenIds = useRef(new Set<string>());
  const seenKeys = useRef(new Set<string>());
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
        const envs = await readMailbox(room);
        setJoined(true);
        const roster = peersFrom(envs, selfId);
        if (roster.length) {
          setPeers(
            roster.map((p) => ({
              id: p.id,
              name: p.name,
              connectionState: "connected" as const,
              candidateType: "relay",
              rttMs: null,
            })),
          );
        }
        const nextTable = tableFrom(envs);
        if (nextTable) setTable(nextTable);
        for (const msg of envs) {
          if (seenIds.current.has(msg.id)) continue;
          seenIds.current.add(msg.id);
          if (msg.from === selfId) continue;
          const t = msg.payload && typeof msg.payload === "object" ? (msg.payload as { t?: string }).t : undefined;
          if (t === "hello") continue;
          const key = payloadKey(msg.payload);
          if (key) {
            if (seenKeys.current.has(key)) continue;
            seenKeys.current.add(key);
          }
          emit(msg.from, msg.payload);
        }
      } catch {
        // next tick retries
      }
      if (!closed.current) timer = setTimeout(() => void poll(), 1200);
    };

    const hello = async () => {
      if (closed.current) return;
      await publishMailbox(room, selfId, { t: "hello", id: selfId, name }).catch(() => {});
    };

    void hello();
    void poll();
    const beat = setInterval(() => void hello(), 20_000);
    return () => {
      closed.current = true;
      if (timer) clearTimeout(timer);
      clearInterval(beat);
    };
  }, [enabled, room, selfId, name]);

  const send = useCallback(
    (data: unknown) => {
      const key = payloadKey(data);
      if (key) seenKeys.current.add(key);
      void sendWithRetry(room, selfId, data).catch(() => {});
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
