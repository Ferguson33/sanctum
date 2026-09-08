import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Send, Swords } from "lucide-react";
import { ArmyPick } from "@/components/chess/ArmyPick";
import { Button } from "@/components/ui/button";
import { BOARD_THEMES, getFaction } from "@/lib/chess/catalog";
import { hostKey, makeRoomCode } from "@/lib/chess/net";
import { getAiLevel, warmOpponent, type AiLevelId } from "@/lib/chess/opponent";
import { usePrefs } from "@/lib/chess/prefs";
import { upsertGameClient, useProfile } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

type Mode = "local" | "ai" | "duel";

export const Route = createFileRoute("/setup")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { mode?: string; lvl?: string; clock?: string; vs?: string; seat?: string } => ({
    ...(typeof raw.mode === "string" ? { mode: raw.mode } : {}),
    ...(typeof raw.lvl === "string" ? { lvl: raw.lvl } : {}),
    ...(typeof raw.clock === "string" ? { clock: raw.clock } : {}),
    ...(typeof raw.vs === "string" ? { vs: raw.vs } : {}),
    ...(typeof raw.seat === "string" ? { seat: raw.seat } : {}),
  }),
  component: SetupPage,
});

function parseMode(raw?: string): Mode {
  if (raw === "ai" || raw === "duel") return raw;
  return "local";
}

function SetupPage() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const prefs = usePrefs();
  const { profile } = useProfile();
  const mode = parseMode(search.mode);
  const level = getAiLevel(search.lvl).id as AiLevelId;
  const vsId = search.vs?.trim() || "";
  const seatName = search.seat?.trim() || "";
  const clockSec = (() => {
    const n = Number(search.clock);
    return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.floor(n)) : 0;
  })();

  const w = getFaction(prefs.wFaction);
  const b = getFaction(prefs.bFaction);
  const showBlack = mode === "local" || mode === "ai";
  const vsSeat = mode === "duel" && Boolean(vsId);

  const title =
    mode === "ai" ? "Play AI" : mode === "duel" ? (vsSeat ? "Duel a seat" : "Invite a guest") : "Pass and play";
  const subtitle =
    mode === "ai"
      ? `${getAiLevel(level).name}${clockSec ? ` · ${Math.round(clockSec / 60)} min` : " · no clock"}`
      : mode === "duel"
        ? vsSeat
          ? `${seatName || "Their seat"} · you play white`
          : clockSec
            ? `${Math.round(clockSec / 60)} min each · link for a guest`
            : "No clock · link for a guest"
        : "Same phone · both armies";

  const cta = mode === "duel" ? (vsSeat ? `Challenge ${seatName || "seat"}` : "Send link") : "Begin match";

  function begin() {
    if (mode === "duel") {
      const room = makeRoomCode();
      localStorage.setItem(hostKey(room), "1");
      if (vsId && profile?.id) {
        void upsertGameClient({
          room,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          ply: 0,
          wFaction: prefs.wFaction,
          bFaction: "",
          board: prefs.boardId,
          clockLimitSec: clockSec > 0 ? clockSec : null,
          asHost: true,
          peerProfileId: vsId,
        }).catch(() => {});
      }
      void nav({
        to: "/r/$code",
        params: { code: room },
        search: {
          w: prefs.wFaction,
          board: prefs.boardId,
          open: "1",
          ...(clockSec > 0 ? { clock: String(clockSec) } : {}),
          ...(seatName ? { seat: seatName } : {}),
        },
      });
      return;
    }
    if (mode === "ai") {
      warmOpponent();
      void nav({
        to: "/play",
        search: {
          vs: "ai",
          lvl: level,
          ...(clockSec > 0 ? { clock: String(clockSec) } : {}),
        },
      });
      return;
    }
    void nav({ to: "/play", search: {} });
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-fg">
      <div aria-hidden className="arena-wash pointer-events-none fixed inset-0" />
      <header className="relative z-10 flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-[12px] border border-border bg-bg/50 text-muted"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-none">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-lg flex-1 overflow-y-auto px-5 pb-36 pt-2">
        <p className="mb-6 text-sm text-pretty text-muted">
          Pick the armies and board for this match. Nothing starts until you{" "}
          {mode === "duel" ? (vsSeat ? "challenge their seat" : "send the link") : "begin"}.
        </p>

        <ArmyPick
          kicker={mode === "duel" ? "Your army (white)" : "Your army"}
          note={
            mode === "duel"
              ? vsSeat
                ? `${seatName || "They"} will see this on My games and pick a different army.`
                : "You play white. They pick a different army from the link."
              : "Tap an army to inspect king through pawn."
          }
          selected={prefs.wFaction}
          taken={showBlack ? prefs.bFaction : undefined}
          onSelect={(id) => prefs.setWFaction(id)}
        />

        {showBlack && (
          <div className="mt-10">
            <ArmyPick
              kicker={mode === "ai" ? "AI army (black)" : "Their army"}
              note={
                mode === "ai"
                  ? `${getAiLevel(level).name} plays this army.`
                  : "Second player on this phone."
              }
              selected={prefs.bFaction}
              taken={prefs.wFaction}
              onSelect={(id) => prefs.setBFaction(id)}
            />
          </div>
        )}

        <p className="mt-10 text-xs uppercase tracking-[0.22em] text-muted">Board</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BOARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => prefs.setBoardId(theme.id)}
              className={cn(
                "overflow-hidden rounded-[20px] border",
                prefs.boardId === theme.id ? "border-ivory" : "border-border",
              )}
            >
              <span
                className="block h-16 w-full"
                style={{
                  backgroundImage: theme.light && theme.dark ? `url(${theme.dark})` : undefined,
                  backgroundColor: "#1c1814",
                  backgroundSize: "cover",
                }}
              />
              <span className="block px-2 py-2 text-left text-xs font-medium">{theme.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted">
          <span className="text-gold">{w.name}</span>
          {showBlack ? (
            <>
              {" "}
              vs <span className="text-ember">{b.name}</span>
            </>
          ) : (
            <> · waiting on their army</>
          )}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button size="lg" className="w-full" onClick={begin} disabled={vsSeat && !profile}>
            {mode === "duel" ? <Send className="size-4" /> : <Swords className="size-4" />}
            {vsSeat && !profile ? "Sign in to challenge" : cta}
          </Button>
        </div>
      </div>
    </main>
  );
}
