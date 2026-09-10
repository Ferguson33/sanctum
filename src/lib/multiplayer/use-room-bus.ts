/**
 * Turn-based room bus. Phones publish hellos and moves straight to the
 * shared mailbox so a Vercel hop cannot drop the second ply.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  payloadKey,
  publishMailbox,
  readMailbox,
  sendWithRetry,
} from "./mailbox";
import type { PeerInfo } from "./p2p";
import type { P2PRoomHandle } from "./use-p2p-room";

interface Options {
  room: string;
  name?: string;
  selfId?: string;
  enabled?: boolean;
  profileId?: string | null;
  profileName?: string | null;
}

export function useRoomBus(options: Options): P2PRoomHandle {
  const enabled = options.enabled ?? true;
  const [selfId] = useState(
    () => options.selfId ?? `p-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [room] = useState(() => options.room);
  const [name] = useState(() => options.name ?? selfId);
  const profileIdRef = useRef(options.profileId ?? null);
  const profileNameRef = useRef(options.profileName ?? null);
  profileIdRef.current = options.profileId ?? null;
  profileNameRef.current = options.profileName ?? null;
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [table, setTable] = useState<{ w: string; b: string; board: string } | null>(null);
  const seenIds = useRef(new Set<string>());
  const seenKeys = useRef(new Set<string>());
  const knownPeers = useRef(new Map<string, PeerInfo>());
  const closed = useRef(false);
  const sendBusy = useRef(0);
  const linkedRef = useRef(false);
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
        const { envs, peers: roster, table: nextTable } = await readMailbox(room, selfId, name);
        setJoined(true);
        if (roster.length) {
          linkedRef.current = true;
          for (const p of roster) {
            const prev = knownPeers.current.get(p.id);
            knownPeers.current.set(p.id, {
              id: p.id,
              name: p.name,
              connectionState: "connected",
              candidateType: "relay",
              rttMs: null,
              profileId: prev?.profileId ?? null,
            });
          }
          setPeers([...knownPeers.current.values()]);
        }
        if (nextTable) setTable(nextTable);
        for (const msg of envs) {
          if (seenIds.current.has(msg.id)) continue;
          seenIds.current.add(msg.id);
          if (msg.from === selfId) continue;
          const payload = msg.payload && typeof msg.payload === "object" ? (msg.payload as Record<string, unknown>) : null;
          const t = payload && typeof payload.t === "string" ? payload.t : undefined;
          if (t === "hello") {
            const profileId =
              typeof payload?.profileId === "string" && payload.profileId
                ? payload.profileId
                : null;
            const peerName =
              typeof payload?.name === "string" && payload.name ? payload.name : msg.from;
            const prev = knownPeers.current.get(msg.from);
            knownPeers.current.set(msg.from, {
              id: msg.from,
              name: peerName,
              connectionState: "connected",
              candidateType: "relay",
              rttMs: null,
              profileId: profileId ?? prev?.profileId ?? null,
            });
            setPeers([...knownPeers.current.values()]);
            continue;
          }
          // Also accept profileId on state envelopes without waiting for Game.
          if (t === "state" && typeof payload?.profileId === "string" && payload.profileId) {
            const prev = knownPeers.current.get(msg.from);
            if (prev && prev.profileId !== payload.profileId) {
              knownPeers.current.set(msg.from, { ...prev, profileId: payload.profileId });
              setPeers([...knownPeers.current.values()]);
            }
          }
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
      // 1.4s linked / 0.7s waiting — faster than this 429s ntfy.sh and End-turn never lands.
      if (!closed.current) timer = setTimeout(() => void poll(), linkedRef.current ? 1400 : 700);
    };

    const hello = async () => {
      if (closed.current) return;
      // Don't compete with End-turn / have acks for ntfy rate limit.
      if (sendBusy.current > 0) return;
      const payload: Record<string, unknown> = { t: "hello", id: selfId, name };
      if (profileIdRef.current) {
        payload.profileId = profileIdRef.current;
        payload.profileName = profileNameRef.current ?? name;
      }
      await publishMailbox(room, selfId, payload).catch(() => {});
    };

    const wake = () => {
      if (closed.current) return;
      if (document.visibilityState !== "visible") return;
      void poll();
    };

    void hello();
    void poll();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    const slow = setInterval(() => {
      void hello();
    }, 20_000);
    return () => {
      closed.current = true;
      if (timer) clearTimeout(timer);
      clearInterval(slow);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [enabled, room, selfId, name]);

  const sendChain = useRef(Promise.resolve());
  const send = useCallback(
    (data: unknown) => {
      const key = payloadKey(data);
      if (key) seenKeys.current.add(key);
      sendBusy.current += 1;
      const job = sendChain.current
        .then(() => sendWithRetry(room, selfId, data))
        .finally(() => {
          sendBusy.current = Math.max(0, sendBusy.current - 1);
        });
      sendChain.current = job.catch(() => {});
      return job;
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

  return useMemo(
    () => ({
      selfId,
      room,
      peers,
      joined,
      table,
      broadcast: send,
      send,
      onMessage,
    }),
    [selfId, room, peers, joined, table, send, onMessage],
  );
}
