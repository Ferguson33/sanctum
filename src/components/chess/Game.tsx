import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Chess } from "chess.js";
import {
  ChevronLeft,
  Flag,
  RotateCcw,
  Settings2,
  Share2,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Board } from "@/components/chess/Board";
import {
  BOARD_THEMES,
  FACTIONS,
  PIECE_SETS,
  type Faction,
  factionSrc,
  getBoard,
  getFaction,
  getSet,
  tableName,
  type PieceType,
  type Side,
} from "@/lib/chess/catalog";
import {
  applyMoveToPieces,
  capturesBy,
  endingOf,
  legalMoves,
  needsPromotion,
  piecesFromFen,
  playMove,
  type Ending,
  type LivePiece,
  type MoveRec,
  type Square,
} from "@/lib/chess/engine";
import { isNetMsg, parseTable, tableQuery, type NetMsg, type TableWire } from "@/lib/chess/net";
import { usePrefs } from "@/lib/chess/prefs";
import { playMoveSound, unlockAudio, armAudioUnlock } from "@/lib/chess/sound";
import { useRoomBus } from "@/lib/multiplayer/use-room-bus";
import { cn } from "@/lib/utils";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROMOTE: PieceType[] = ["q", "r", "b", "n"];

type Phase = "idle" | "selected" | "promotion" | "animating" | "over";

interface GameProps {
  mode: "local" | "online";
  room?: string;
  host?: boolean;
  selfId?: string;
  invite?: TableWire | null;
}

export function Game(props: GameProps) {
  return (
    <TableGuard>
      <GameTable {...props} />
    </TableGuard>
  );
}

class TableGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
          <p className="font-display text-3xl">The table stalled</p>
          <p className="max-w-sm text-sm text-muted">Reload to sit again. Canon glyphs always work if a host image is missing.</p>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function GameTable({ mode, room, host = false, selfId, invite }: GameProps) {
  const prefs = usePrefs();
  const [table, setTable] = useState<TableWire>(
    () => invite ?? { w: prefs.wFaction, b: prefs.bFaction, board: prefs.boardId },
  );
  const wFaction = getFaction(table.w);
  const bFaction = getFaction(table.b);
  const board = getBoard(table.board);
  const title = tableName(wFaction, bFaction);

  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(START);
  const [pieces, setPieces] = useState<LivePiece[]>(() => piecesFromFen(START));
  const [history, setHistory] = useState<MoveRec[]>([]);
  const [orientation, setOrientation] = useState<Side>("w");
  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Square[]>([]);
  const [caps, setCaps] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [impact, setImpact] = useState<{ square: Square; kind: "move" | "capture" | "check" } | null>(null);
  const impactTimer = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [ending, setEnding] = useState<Ending>(null);
  const [settings, setSettings] = useState(false);
  const [turn, setTurn] = useState<Side>("w");
  const [solo, setSolo] = useState(false);

  const p2p = useRoomBus({
    room: room ?? "local",
    name: host ? wFaction.name : bFaction.name,
    selfId,
    enabled: mode === "online" && !!room,
  });

  const connectedPeer = p2p.peers.find((p) => p.connectionState === "connected");
  const waiting = mode === "online" && !connectedPeer && !solo;
  const myColor: Side | "both" = mode === "local" || solo ? "both" : host ? "w" : "b";

  useEffect(() => {
    if (mode === "local") return;
    return p2p.onMessage((_from, data, channel) => {
      if (channel !== "reliable") return;
      if (!isNetMsg(data)) return;
      handleNet(data);
    });
    // handleNet is stable enough via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.onMessage, mode]);

  useEffect(() => {
    if (mode !== "online" || !host || !connectedPeer) return;
    const msg: NetMsg = {
      t: "sync",
      fen: chessRef.current.fen(),
      setId: prefs.setId,
      boardId: table.board,
      wFaction: table.w,
      bFaction: table.b,
    };
    p2p.send(msg, connectedPeer.id);
  }, [connectedPeer?.id, host, mode]); // eslint-disable-line

  useEffect(() => {
    if (mode === "online") setOrientation(host ? "w" : "b");
  }, [mode, host]);

  useEffect(() => {
    if (mode !== "online" || host || !p2p.table) return;
    const next = parseTable(p2p.table);
    if (next) setTable(next);
  }, [mode, host, p2p.table]);

  useEffect(() => {
    if (mode !== "online" || !host || !room) return;
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "table", room, w: table.w, b: table.b, board: table.board }),
    }).catch(() => {});
  }, [mode, host, room, table.w, table.b, table.board]);

  useEffect(() => armAudioUnlock(), []);

  const canMove = useCallback(
    (color: Side) => {
      if (phase === "over" || phase === "animating" || phase === "promotion") return false;
      if (myColor === "both") return true;
      return myColor === color && turn === color;
    },
    [phase, myColor, turn],
  );

  function snapshot(nextChess: Chess, move: MoveRec | null) {
    setFen(nextChess.fen());
    setTurn(nextChess.turn());
    const end = endingOf(nextChess);
    if (end) {
      setEnding(end);
      setPhase("over");
    } else {
      setPhase("idle");
    }
    if (move) {
      setLastMove({ from: move.from, to: move.to });
      setHistory((h) => [...h, move]);
    }
  }

  function commitMove(from: Square, to: Square, promotion?: PieceType, remote = false) {
    const chess = chessRef.current;
    const move = playMove(chess, from, to, promotion);
    if (!move) return;
    setPieces((ps) => applyMoveToPieces(ps, move));
    setSelected(null);
    setLegal([]);
    setCaps([]);
    setPending(null);
    setPhase("animating");
    const kind = chess.isCheck() ? "check" : move.captured ? "capture" : "move";
    if (prefs.sound) playMoveSound(kind);
    window.clearTimeout(impactTimer.current);
    setImpact({ square: to, kind });
    impactTimer.current = window.setTimeout(() => setImpact(null), 560);
    window.setTimeout(() => {
      snapshot(chess, move);
      if (mode === "local" && prefs.autoFlip) setOrientation(chess.turn());
      if (chess.isGameOver() && prefs.sound) playMoveSound("end");
    }, 240);
    if (!remote && mode === "online") {
      const msg: NetMsg = { t: "move", from, to, promotion, fen: chess.fen() };
      p2p.send(msg);
    }
  }

  function handleNet(msg: NetMsg) {
    const chess = chessRef.current;
    if (msg.t === "sync") {
      chess.load(msg.fen);
      setPieces(piecesFromFen(msg.fen));
      setFen(msg.fen);
      setTurn(chess.turn());
      setHistory([]);
      setLastMove(null);
      setEnding(endingOf(chess));
      applyTheme(msg.setId, msg.boardId, msg.wFaction, msg.bFaction);
      return;
    }
    if (msg.t === "move") {
      if (chess.fen() === msg.fen) return;
      commitMove(msg.from as Square, msg.to as Square, msg.promotion, true);
      return;
    }
    if (msg.t === "resign") {
      const winner: Side = host ? "w" : "b";
      setEnding({ kind: "resign", winner });
      setPhase("over");
      return;
    }
    if (msg.t === "reset") {
      reset(msg.fen, true);
      return;
    }
    if (msg.t === "theme") {
      applyTheme(msg.setId, msg.boardId, msg.wFaction, msg.bFaction);
    }
  }

  function applyTheme(setId: string, boardId: string, w?: string, b?: string) {
    const next =
      parseTable({ w: w ?? table.w, b: b ?? table.b, board: boardId }) ?? {
        w: table.w,
        b: table.b,
        board: boardId,
      };
    setTable(next);
    if (w && b) {
      prefs.setWFaction(w);
      prefs.setBFaction(b);
    } else {
      prefs.setSetId(setId);
    }
    prefs.setBoardId(boardId);
  }

  function onSquare(sq: Square) {
    unlockAudio();
    const chess = chessRef.current;
    if (phase === "over" || phase === "animating" || waiting) return;
    if (!canMove(chess.turn())) return;

    if (phase === "selected" && selected) {
      if (legal.includes(sq) || caps.includes(sq)) {
        if (needsPromotion(chess, selected, sq)) {
          setPending({ from: selected, to: sq });
          setPhase("promotion");
          return;
        }
        commitMove(selected, sq);
        return;
      }
    }

    const piece = chess.get(sq);
    if (piece && piece.color === chess.turn()) {
      const moves = legalMoves(chess, sq);
      setSelected(sq);
      setLegal(moves.filter((m) => !m.captured).map((m) => m.to));
      setCaps(moves.filter((m) => m.captured).map((m) => m.to));
      setPhase("selected");
      return;
    }
    setSelected(null);
    setLegal([]);
    setCaps([]);
    setPhase("idle");
  }

  function reset(nextFen = START, remote = false) {
    const chess = new Chess(nextFen);
    chessRef.current = chess;
    setFen(chess.fen());
    setPieces(piecesFromFen(chess.fen()));
    setHistory([]);
    setLastMove(null);
    setSelected(null);
    setLegal([]);
    setCaps([]);
    setPending(null);
    setEnding(null);
    setPhase("idle");
    setTurn(chess.turn());
    if (mode === "local") setOrientation("w");
    if (!remote && mode === "online") p2p.send({ t: "reset", fen: chess.fen() } satisfies NetMsg);
  }

  function undo() {
    if (mode !== "local") return;
    const chess = chessRef.current;
    const undone = chess.undo();
    if (!undone) return;
    setPieces(piecesFromFen(chess.fen()));
    snapshot(chess, null);
    setHistory((h) => h.slice(0, -1));
    setLastMove(null);
    if (prefs.autoFlip) setOrientation(chess.turn());
  }

  async function shareRoom() {
    if (!room) return;
    const url = `${window.location.origin}/r/${room}?${tableQuery(table)}`;
    const text = `${wFaction.name} vs ${bFaction.name} — join ${room}`;
    try {
      if (navigator.share) await navigator.share({ title: "Sanctum", url, text });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied");
      }
    } catch {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    }
  }

  const heavenCaps = capturesBy(history, "w");
  const hellCaps = capturesBy(history, "b");
  const sideToMove = turn === "w" ? wFaction : bFaction;

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden className="arena-wash pointer-events-none absolute inset-0" />

      <header className="relative z-10 flex shrink-0 items-center gap-2 bg-gradient-to-b from-bg via-bg/80 to-transparent px-2 pb-1 pt-[max(0.4rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-[12px] border border-border bg-bg/50 text-muted"
          aria-label="Home"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-none sm:text-xl">{title}</p>
          <p className="truncate text-xs text-muted">
            {waiting
              ? "Waiting for the other throne"
              : ending
                ? endLabel(ending, wFaction.name, bFaction.name)
                : (
                    <>
                      <span className={turn === "w" ? "text-gold" : "text-ember"}>{sideToMove.name}</span>
                      {" to move"}
                    </>
                  )}
            {chessRef.current.isCheck() && phase !== "over" ? (
              <span className="text-ember"> · check</span>
            ) : (
              ""
            )}
          </p>
        </div>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-[12px] border border-border bg-bg/50"
          onClick={() => {
            const next = !prefs.sound;
            prefs.setSound(next);
            if (next) {
              unlockAudio();
              playMoveSound("test");
            }
          }}
          aria-label="Sound"
        >
          {prefs.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-[12px] border border-border bg-bg/50"
          onClick={() => setSettings(true)}
          aria-label="Settings"
        >
          <Settings2 className="size-4" />
        </button>
      </header>

      {mode === "online" && (
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-4 py-1 text-xs text-muted">
          <span className="font-medium tracking-[0.2em] text-fg">{room}</span>
          <span>
            {connectedPeer
              ? connectedPeer.rttMs != null
                ? `${connectedPeer.rttMs} ms`
                : "linked"
              : p2p.joined
                ? "searching"
                : "connecting"}
          </span>
          <button type="button" className="inline-flex items-center gap-1 text-ivory" onClick={shareRoom}>
            <Share2 className="size-3.5" /> Share
          </button>
        </div>
      )}

      <Captured row={orientation === "w" ? hellCaps : heavenCaps} faction={orientation === "w" ? bFaction : wFaction} />

      <div className="relative z-10 min-h-0 flex-1 px-1">
        <Board
          fen={fen}
          pieces={pieces}
          orientation={orientation}
          selected={selected}
          legal={legal}
          captures={caps}
          lastMove={lastMove}
          impact={impact}
          wFaction={wFaction}
          bFaction={bFaction}
          board={board}
          tilt={prefs.tilt}
          disabled={waiting || phase === "over" || (myColor !== "both" && turn !== myColor)}
          onSquare={onSquare}
        />
      </div>

      <Captured row={orientation === "w" ? heavenCaps : hellCaps} faction={orientation === "w" ? wFaction : bFaction} />

      <footer className="relative z-10 flex shrink-0 items-center gap-2 bg-gradient-to-t from-bg via-bg/80 to-transparent px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1">
        {mode === "local" ? (
          <>
            <Button variant="subtle" size="sm" onClick={undo} disabled={history.length === 0}>
              <Undo2 className="size-4" /> Undo
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              Flip
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reset()}>
              <RotateCcw className="size-4" /> New
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              You are {host ? wFaction.name : bFaction.name}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                const winner: Side = host ? "b" : "w";
                setEnding({ kind: "resign", winner });
                setPhase("over");
                p2p.send({ t: "resign" } satisfies NetMsg);
              }}
            >
              <Flag className="size-4" /> Resign
            </Button>
          </>
        )}
      </footer>

      {waiting && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[5.5rem] z-20 mx-auto max-w-sm px-4">
          <div className="panel pointer-events-auto rounded-[24px] p-4 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Waiting for the other throne</p>
            <p className="font-display mt-1 text-3xl tracking-[0.28em]">{room}</p>
            <p className="mt-2 text-sm text-muted text-pretty">
              {title} is set. Share this link — they sit the same armies.
            </p>
            <Button className="mt-3 w-full" onClick={shareRoom}>
              Share link
            </Button>
            <button
              type="button"
              className="mt-2 text-xs text-muted underline-offset-2 hover:underline"
              onClick={() => setSolo(true)}
            >
              Sit this screen anyway
            </button>
          </div>
        </div>
      )}

      {phase === "promotion" && pending && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-bg/60 p-4 pb-24">
          <div className="panel w-full max-w-sm rounded-[24px] p-4">
            <p className="text-center text-sm text-muted">Promote pawn</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {PROMOTE.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rounded-[16px] bg-surface-2 p-2"
                  onClick={() => commitMove(pending.from, pending.to, t)}
                >
                  <img src={factionSrc(turn === "w" ? wFaction : bFaction, t)} alt={t} className="mx-auto h-20 w-auto" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {ending && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 p-4">
          <div className="panel w-full max-w-sm rounded-[28px] p-6 text-center">
            <p className="font-display text-3xl">{endTitle(ending, wFaction.name, bFaction.name)}</p>
            <p className="mt-2 text-sm text-muted">{endLabel(ending, wFaction.name, bFaction.name)}</p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={() => reset()}>
                Play again
              </Button>
              <Link to="/" className="flex-1">
                <Button variant="ghost" className="w-full">
                  Leave
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {settings && (
        <SettingsSheet
          onClose={() => setSettings(false)}
          onTheme={(setId, boardId, w, b) => {
            applyTheme(setId, boardId, w, b);
            if (mode === "online") {
              p2p.send({ t: "theme", setId, boardId, wFaction: w, bFaction: b } satisfies NetMsg);
            }
          }}
        />
      )}
    </div>
  );
}

function Captured({
  row,
  faction,
}: {
  row: PieceType[];
  faction: Faction;
}) {
  return (
    <div className="relative z-10 flex h-8 shrink-0 items-center gap-1 overflow-x-auto px-3">
      {row.map((t, i) => (
        <img
          key={`${t}-${i}`}
          src={factionSrc(faction, t)}
          alt=""
          className={cn("h-7 w-auto opacity-90", i === row.length - 1 && "cap-in")}
        />
      ))}
    </div>
  );
}

function SettingsSheet({
  onClose,
  onTheme,
}: {
  onClose: () => void;
  onTheme: (setId: string, boardId: string, wFaction: string, bFaction: string) => void;
}) {
  const prefs = usePrefs();
  const paired = prefs.wFaction === getSet(prefs.setId).w && prefs.bFaction === getSet(prefs.setId).b;

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-bg/60" onClick={onClose}>
      <div
        className="max-h-[80dvh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 shadow-[0_-24px_60px_rgba(0,0,0,.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border" />
        <p className="font-display text-2xl">Table</p>
        <p className="mt-1 text-sm text-muted">Pick a pairing, or mix the hosts. Rules stay the same.</p>

        <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted">Pairing</p>
        <div className="mt-2 grid gap-2">
          {PIECE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                prefs.setSetId(s.id);
                onTheme(s.id, prefs.boardId, s.w, s.b);
              }}
              className={cn(
                "flex items-center gap-3 rounded-[16px] border px-3 py-3 text-left",
                paired && prefs.setId === s.id ? "border-ivory bg-surface-2" : "border-border",
              )}
            >
              <img src={factionSrc(getFaction(s.w), "k")} alt="" className="h-12 w-auto" />
              <img src={factionSrc(getFaction(s.b), "k")} alt="" className="h-12 w-auto" />
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="block text-xs text-muted">{s.tagline}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted">White plays as</p>
        <FactionRow
          selected={prefs.wFaction}
          onPick={(id) => {
            prefs.setWFaction(id);
            onTheme(prefs.setId, prefs.boardId, id, prefs.bFaction);
          }}
        />
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">Black plays as</p>
        <FactionRow
          selected={prefs.bFaction}
          onPick={(id) => {
            prefs.setBFaction(id);
            onTheme(prefs.setId, prefs.boardId, prefs.wFaction, id);
          }}
        />

        <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted">Board</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {BOARD_THEMES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                prefs.setBoardId(b.id);
                onTheme(prefs.setId, b.id, prefs.wFaction, prefs.bFaction);
              }}
              className={cn(
                "overflow-hidden rounded-[16px] border text-left",
                prefs.boardId === b.id ? "border-ivory" : "border-border",
              )}
            >
              <span
                className="block h-14 w-full"
                style={{
                  backgroundColor: b.darkFill,
                  backgroundImage: b.dark ? `url(${b.dark})` : undefined,
                  backgroundSize: "cover",
                }}
              />
              <span className="block px-2 py-2 text-xs font-medium">{b.name}</span>
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs uppercase tracking-[0.18em] text-muted">
          Tilt {prefs.tilt}° — {prefs.tilt === 0 ? "flat, full board" : "table"}
        </label>
        <input
          type="range"
          min={0}
          max={28}
          value={prefs.tilt}
          onChange={(e) => prefs.setTilt(Number(e.target.value))}
          className="mt-2 w-full accent-ivory"
        />

        <label className="mt-4 flex items-center justify-between text-sm">
          Flip the board each turn
          <input
            type="checkbox"
            checked={prefs.autoFlip}
            onChange={(e) => prefs.setAutoFlip(e.target.checked)}
            className="size-4 accent-ivory"
          />
        </label>

        <Button className="mt-6 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function FactionRow({ selected, onPick }: { selected: string; onPick: (id: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {FACTIONS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onPick(f.id)}
          className={cn(
            "flex flex-col items-center rounded-[16px] border px-1 py-2",
            selected === f.id ? "border-ivory bg-surface-2" : "border-border",
          )}
        >
          <img src={factionSrc(f, "k")} alt="" className="h-12 w-auto" />
          <span className="mt-1 text-[11px] font-medium leading-none">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

function endTitle(end: Ending, heaven: string, hell: string) {
  if (!end) return "";
  if (end.kind === "checkmate" || end.kind === "resign") {
    return end.winner === "w" ? `${heaven} stands` : `${hell} stands`;
  }
  return "Drawn";
}

function endLabel(end: Ending, heaven: string, hell: string) {
  if (!end) return "";
  if (end.kind === "checkmate") return `Checkmate — ${end.winner === "w" ? heaven : hell}`;
  if (end.kind === "resign") return `${end.winner === "w" ? hell : heaven} resigned`;
  if (end.kind === "stalemate") return "Stalemate";
  if (end.kind === "draw") return end.reason;
  return "";
}
