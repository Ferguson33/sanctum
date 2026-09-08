import { useCallback, useEffect, useState } from "react";
import type { Profile, Standing, MatchRow } from "./types";

export type PublicProfile = Pick<Profile, "id" | "displayName" | "crestFaction" | "crestPiece">;

async function profileFetch<T>(
  op: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = body ? "POST" : "GET",
): Promise<T> {
  const url =
    method === "GET"
      ? `/api/profile?op=${encodeURIComponent(op)}`
      : "/api/profile";
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify({ op, ...body }) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `profile ${op} failed`);
  }
  return data;
}

export function claimProfile(input: {
  name: string;
  pin: string;
  crestFaction: string;
  crestPiece: string;
}) {
  return profileFetch<{ profile: PublicProfile }>("claim", input);
}

export function signInProfile(input: { name: string; pin: string }) {
  return profileFetch<{ profile: PublicProfile }>("signin", input);
}

export function signOutProfile() {
  return profileFetch<{ ok: true }>("signout", {});
}

export function fetchMe() {
  return profileFetch<{ profile: PublicProfile | null }>("me");
}

export function fetchStandings() {
  return profileFetch<{ standings: Standing[] }>("standings");
}

export function fetchH2H(otherId: string) {
  return profileFetch<{ you: number; them: number; recent: MatchRow[]; other: PublicProfile | null }>(
    "h2h",
    { otherId },
  );
}

export function recordMatchClient(input: {
  winnerId: string;
  loserId: string;
  wFaction: string;
  bFaction: string;
  room?: string;
}) {
  return profileFetch<{ ok: boolean; id?: string; duplicate?: boolean; error?: string }>(
    "record",
    input,
  );
}

export function useProfile() {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMe();
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load seat");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, error, refresh, setProfile };
}
