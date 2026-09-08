import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FACTIONS,
  PIECE_LABEL,
  PIECE_TYPES,
  factionSrc,
  getFaction,
  type PieceType,
} from "@/lib/chess/catalog";
import {
  claimProfile,
  signInProfile,
  signOutProfile,
  useProfile,
} from "@/lib/profile/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

type Mode = "claim" | "signin";

function ProfilePage() {
  const { profile, loading, refresh, setProfile } = useProfile();
  const [mode, setMode] = useState<Mode>("claim");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [crestFaction, setCrestFaction] = useState(FACTIONS[0]?.id ?? "good");
  const [crestPiece, setCrestPiece] = useState<PieceType>("k");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const faction = useMemo(() => getFaction(crestFaction), [crestFaction]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "claim") {
        const data = await claimProfile({
          name,
          pin,
          crestFaction,
          crestPiece,
        });
        setProfile(data.profile);
      } else {
        const data = await signInProfile({ name, pin });
        setProfile(data.profile);
      }
      setPin("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save seat");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setErr(null);
    try {
      await signOutProfile();
      setProfile(null);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not sign out");
    } finally {
      setBusy(false);
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
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gold">Your seat</p>
            <h1 className="font-display text-3xl leading-none">Profile</h1>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : profile ? (
          <section className="panel rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <img
                src={factionSrc(getFaction(profile.crestFaction), profile.crestPiece as PieceType)}
                alt=""
                className="h-16 w-12 object-contain object-bottom"
              />
              <div>
                <p className="font-display text-2xl leading-none">{profile.displayName}</p>
                <p className="mt-1 text-sm text-muted">
                  {getFaction(profile.crestFaction).name} · {PIECE_LABEL[profile.crestPiece as PieceType] ?? profile.crestPiece}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => void onSignOut()} disabled={busy}>
                Sign out
              </Button>
              <Link to="/standings" className="flex-1">
                <Button variant="subtle" className="w-full">
                  Standings
                </Button>
              </Link>
            </div>
          </section>
        ) : (
          <section className="panel rounded-[24px] p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("claim")}
                className={cn(
                  "rounded-[14px] border px-3 py-2 text-sm",
                  mode === "claim" ? "border-ivory bg-bg/70" : "border-border bg-bg/40",
                )}
              >
                Claim seat
              </button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={cn(
                  "rounded-[14px] border px-3 py-2 text-sm",
                  mode === "signin" ? "border-ivory bg-bg/70" : "border-border bg-bg/40",
                )}
              >
                Sign in
              </button>
            </div>
            <p className="mb-3 text-sm text-pretty text-muted">
              {mode === "claim"
                ? "Pick a display name, a 4–6 digit PIN, and a crest. Friends use the same name + PIN on their phone."
                : "Enter the name and PIN you claimed. No Apple or Google — just your seat."}
            </p>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={24}
                  required
                  autoComplete="username"
                  className="mt-1 h-12 w-full rounded-[14px] border border-border bg-surface px-4 text-sm outline-none focus:border-ivory"
                  placeholder="Your name"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted">PIN</span>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  required
                  autoComplete="current-password"
                  className="mt-1 h-12 w-full rounded-[14px] border border-border bg-surface px-4 text-sm tracking-[0.35em] outline-none focus:border-ivory"
                  placeholder="••••"
                />
              </label>

              {mode === "claim" && (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Crest host</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {FACTIONS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setCrestFaction(f.id)}
                          className={cn(
                            "flex flex-col items-center rounded-[16px] border px-1 py-2",
                            crestFaction === f.id ? "border-ivory bg-bg/70" : "border-border bg-bg/40",
                          )}
                        >
                          <img
                            src={factionSrc(f, "k")}
                            alt=""
                            className="h-12 w-auto object-contain object-bottom"
                          />
                          <span className="mt-1 text-[10px] leading-tight text-muted">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
                      Crest piece · {faction.name}
                    </p>
                    <div className="mt-2 grid grid-cols-6 gap-1.5">
                      {PIECE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCrestPiece(t)}
                          className={cn(
                            "flex flex-col items-center rounded-[14px] border px-0.5 py-1.5",
                            crestPiece === t ? "border-ivory bg-bg/70" : "border-border bg-bg/40",
                          )}
                          aria-label={PIECE_LABEL[t]}
                        >
                          <img
                            src={factionSrc(faction, t)}
                            alt=""
                            className="h-10 w-auto object-contain object-bottom"
                          />
                          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">
                            {PIECE_LABEL[t].slice(0, 1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {err && <p className="text-sm text-ember">{err}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={busy || pin.length < 4}>
                {busy ? "Working…" : mode === "claim" ? "Claim seat" : "Sign in"}
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
