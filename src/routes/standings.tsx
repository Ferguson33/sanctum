import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PIECE_LABEL,
  factionSrc,
  getFaction,
  type PieceType,
} from "@/lib/chess/catalog";
import {
  fetchH2H,
  fetchStandings,
  useProfile,
  type PublicProfile,
} from "@/lib/profile/client";
import type { MatchRow, Standing } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/standings")({
  component: StandingsPage,
});

function Crest({ faction, piece, className }: { faction: string; piece: string; className?: string }) {
  return (
    <img
      src={factionSrc(getFaction(faction), piece as PieceType)}
      alt=""
      className={cn("object-contain object-bottom", className ?? "h-10 w-8")}
    />
  );
}

function StandingsPage() {
  const nav = useNavigate();
  const { profile, loading: seatLoading } = useProfile();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Standing | null>(null);
  const [h2h, setH2h] = useState<{
    you: number;
    them: number;
    recent: MatchRow[];
    other: PublicProfile | null;
  } | null>(null);
  const [h2hLoading, setH2hLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const data = await fetchStandings();
        if (alive) setStandings(data.standings);
      } catch (error) {
        if (alive) setErr(error instanceof Error ? error.message : "Could not load standings");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openH2H(row: Standing) {
    setSelected(row);
    setH2h(null);
    if (!profile) return;
    if (row.id === profile.id) return;
    setH2hLoading(true);
    try {
      const data = await fetchH2H(row.id);
      setH2h(data);
    } catch {
      setH2h(null);
    } finally {
      setH2hLoading(false);
    }
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
            <h1 className="font-display text-3xl leading-none">Standings</h1>
          </div>
          <Link to="/profile" className="text-xs text-gold underline-offset-2 hover:underline">
            {seatLoading ? "…" : profile ? profile.displayName : "Claim seat"}
          </Link>
        </header>

        <p className="text-sm text-pretty text-muted">
          Wins and losses. Live = both of you in the app (clock ok). Later = they pick it up on My games, no clock.
        </p>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : err ? (
          <p className="text-sm text-ember">{err}</p>
        ) : standings.length === 0 ? (
          <section className="panel rounded-[24px] p-4 text-sm text-muted">
            No seats yet. <Link to="/profile" className="text-gold underline-offset-2 hover:underline">Claim one</Link>{" "}
            and play a duel.
          </section>
        ) : (
          <ul className="flex flex-col gap-2">
            {standings.map((row, i) => {
              const mine = profile?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void openH2H(row)}
                    className={cn(
                      "panel flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left",
                      selected?.id === row.id && "border-ivory",
                    )}
                  >
                    <span className="w-6 text-center text-xs text-muted">{i + 1}</span>
                    <Crest faction={row.crestFaction} piece={row.crestPiece} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {row.displayName}
                        {mine ? <span className="ml-1 text-xs text-gold">you</span> : null}
                      </p>
                      <p className="text-[11px] text-muted">
                        {getFaction(row.crestFaction).name} ·{" "}
                        {PIECE_LABEL[row.crestPiece as PieceType] ?? row.crestPiece}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl leading-none">
                        {row.wins}–{row.losses}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">W–L</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <section className="panel rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <Crest faction={selected.crestFaction} piece={selected.crestPiece} className="h-14 w-10" />
              <div>
                <p className="font-display text-2xl leading-none">{selected.displayName}</p>
                <p className="text-sm text-muted">
                  {selected.wins}W · {selected.losses}L
                </p>
              </div>
            </div>
            {!profile ? (
              <p className="mt-3 text-sm text-muted">
                <Link to="/profile" className="text-gold underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                to see head-to-head.
              </p>
            ) : selected.id === profile.id ? (
              <p className="mt-3 text-sm text-muted">That’s your seat.</p>
            ) : h2hLoading ? (
              <p className="mt-3 text-sm text-muted">Loading head-to-head…</p>
            ) : h2h ? (
              <div className="mt-3">
                <p className="text-sm">
                  Head-to-head: <span className="text-gold">{h2h.you}</span> – {h2h.them}
                </p>
                {h2h.recent.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No finished duels yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {h2h.recent.map((m) => (
                      <li key={m.id} className="rounded-[12px] border border-border bg-bg/40 px-3 py-2 text-xs text-muted">
                        {m.winnerId === profile.id ? "You won" : "They won"} ·{" "}
                        {getFaction(m.wFaction).name} vs {getFaction(m.bFaction).name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Could not load head-to-head.</p>
            )}
            {profile && selected.id !== profile.id ? (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Live — both of you in the app</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { sec: 0, label: "No clock" },
                    { sec: 180, label: "3 min" },
                    { sec: 300, label: "5 min" },
                    { sec: 600, label: "10 min" },
                  ].map((c) => (
                    <button
                      key={`live-${c.sec}`}
                      type="button"
                      onClick={() =>
                        void nav({
                          to: "/setup",
                          search: {
                            mode: "duel",
                            vs: selected.id,
                            seat: selected.displayName,
                            live: "1",
                            ...(c.sec > 0 ? { clock: String(c.sec) } : {}),
                          },
                        })
                      }
                      className="rounded-[16px] border border-border bg-bg/50 px-3 py-2 text-left"
                    >
                      <span className="font-display block text-lg leading-none">{c.label}</span>
                      <span className="mt-1 block text-xs text-muted">They accept now</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() =>
                    void nav({
                      to: "/setup",
                      search: {
                        mode: "duel",
                        vs: selected.id,
                        seat: selected.displayName,
                      },
                    })
                  }
                >
                  Challenge later — no clock
                </Button>
              </div>
            ) : null}
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setSelected(null)}>
              Close
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
