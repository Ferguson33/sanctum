import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/chess/Game";

export const Route = createFileRoute("/play")({
  component: PlayPage,
});

function PlayPage() {
  return <Game mode="local" />;
}
