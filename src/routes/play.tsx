import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/chess/Game";
import { getAiLevel, type AiLevelId } from "@/lib/chess/opponent";

export const Route = createFileRoute("/play")({
  validateSearch: (raw: Record<string, unknown>): { vs?: string; lvl?: string; clock?: string } => ({
    ...(typeof raw.vs === "string" ? { vs: raw.vs } : {}),
    ...(typeof raw.lvl === "string" ? { lvl: raw.lvl } : {}),
    ...(typeof raw.clock === "string" ? { clock: raw.clock } : {}),
  }),
  component: PlayPage,
});

function PlayPage() {
  const search = Route.useSearch();
  const vsAi = search.vs === "ai";
  const level = getAiLevel(search.lvl).id as AiLevelId;
  const clockSec = (() => {
    const n = Number(search.clock);
    return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.floor(n)) : 0;
  })();
  return <Game mode={vsAi ? "ai" : "local"} aiLevel={level} clockSec={clockSec} />;
}
