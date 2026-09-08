import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Chess } from "chess.js";
import {
  ChevronLeft,
  Flag,
  RotateCcw,
  Send,
  Settings2,
  Share2,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Board } from "@/components/chess/Board";
import { ArmyPick } from "@/components/chess/ArmyPick";
import { Parade } from "@/components/chess/Parade";
import {
  BOARD_THEMES,
  FACTIONS,
  PIECE_SETS,
  type Faction,
  factionSrc,
  getBoard,
  getFaction,
  getSet,
  otherFaction,
  tableName,
  PIECE_LABEL,
  type PieceType,
  type Side,
} from "@/lib/chess/catalog";
import {
  applyMoveToPieces,
  capturesBy,
  castleSideOf,
  endingOf,
  legalMoves,
  needsPromotion,
  piecesFromFen,
  reconcilePieces,
  playMove,
  type Ending,
  type LivePiece,
  type MoveRec,
  type Square,
} from "@/lib/chess/engine";
import { isNetMsg, parseTable, tableQuery, type NetMsg, type TableWire } from "@/lib/chess/net";
import { usePrefs } from "@/lib/chess/prefs";
import { playMoveSound, unlockAudio, armAudioUnlock } from "@/lib/chess/sound";
import { playHaptic } from "@/lib/chess/haptic";
import { plyOfFen, publishMailbox } from "@/lib/multiplayer/mailbox";
import { getAiLevel, think, type AiLevelId } from "@/lib/chess/opponent";
import { useRoomBus } from "@/lib/multiplayer/use-room-bus";
import { cn } from "@/lib/utils";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROMOTE: PieceType[] = ["q", "r", "b", "n"];

type Phase = "idle" | "selected" | "promotion" | "animating" | "over";
type Handoff = "idle" | "ready" | "sending" | "theirs";
type Callout = {
  kind: "turn" | "check" | "moved" | "sat" | "taken";
  title: string;
  body: string;
} | null;

interface GameProps {
  mode: "local" | "online" | "ai";
  room?: string;
  host?: boolean;
  selfId?: string;
  invite?: TableWire | null;
  aiLevel?: AiLevelId;
  /** Seconds per side for online challenge clocks (0 = off). */
  clockSec?: number;
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

function GameTable({ mode, room, host = false, selfId, invite, aiLevel = "knight", clockSec = 0 }: GameProps) {
  const prefs = usePrefs();
  const [table, setTable] = useState<TableWire>(() => {
    if (invite?.w) return { w: invite.w, b: invite.b, board: invite.board };
    if (mode === "online") return { w: prefs.wFaction, b: "", board: prefs.boardId };
    return { w: prefs.wFaction, b: prefs.bFaction, board: prefs.boardId };
  });
  const wFaction = getFaction(table.w);
  const bFaction = getFaction(table.b);
  const board = getBoard(table.board);
  const seated = Boolean(table.b);
  const title = seated ? tableName(wFaction, bFaction) : wFaction.name;

  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(START);
  const [pieces, setPieces] = useState<LivePiece[]>(() => piecesFromFen(START));
  const [history, setHistory] = useState<MoveRec[]>([]);
  const [orientation, setOrientation] = useState<Side>("w");
  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Square[]>([]);
  const [castleRooks, setCastleRooks] = useState<Square[]>([]);
  const [caps, setCaps] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square; captured?: boolean } | null>(null);
  const [freshCap, setFreshCap] = useState<{ side: Side; type: PieceType; key: number } | null>(null);
  const freshCapTimer = useRef(0);
  const [impact, setImpact] = useState<{ square: Square; kind: "move" | "capture" | "check" } | null>(null);
  const impactTimer = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [ending, setEnding] = useState<Ending>(null);
  const [settings, setSettings] = useState(false);
  const [turn, setTurn] = useState<Side>("w");
  const [linked, setLinked] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>("idle");
  const [callout, setCallout] = useState<Callout>(null);
  const [parade, setParade] = useState(mode === "local" || mode === "ai");
  const didParade = useRef(mode === "local" || mode === "ai");
  const [thinking, setThinking] = useState(false);
  const didSync = useRef(false);
  const handoffRef = useRef<Handoff>("idle");
  const calloutTimer = useRef(0);
  const incomingPly = useRef(false);
  handoffRef.current = handoff;

  const [clockLimit, setClockLimit] = useState(() =>
    (mode === "online" || mode === "ai") && clockSec > 0 ? clockSec : 0,
  );
  const [clocks, setClocks] = useState(() => {
    const ms = clockLimit * 1000;
    return { w: ms, b: ms };
  });
  const clocksRef = useRef(clocks);
  clocksRef.current = clocks;

  // Rebuild piece sprites from FEN on resize — kills stray off-board ghosts.
  useEffect(() => {
    let t = 0;
    const sync = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        setPieces((ps) => reconcilePieces(ps, chessRef.current.fen()));
      }, 80);
    };
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const p2p = useRoomBus({
    room: room ?? "local",
    name: host ? wFaction.name : bFaction.name,
    selfId,
    enabled: mode === "online" && !!room,
  });

  const connectedPeer = p2p.peers.find((p) => p.connectionState === "connected");
  useEffect(() => {
    if (connectedPeer) setLinked(true);
  }, [connectedPeer]);
  const myColor: Side | "both" = mode === "local" ? "both" : mode === "ai" || host ? "w" : "b";
  const mySide: Side = myColor === "b" ? "b" : "w";
  const myFaction = mySide === "b" ? bFaction : wFaction;
  const theirFaction = mySide === "b" ? wFaction : bFaction;
  const skipParade = useCallback(() => {
    unlockAudio();
    setParade(false);
  }, []);
  const [draftBlack, setDraftBlack] = useState(() => otherFaction(table.w, prefs.bFaction));

  useEffect(() => {
    if (mode !== "online" || !seated || didParade.current) return;
    didParade.current = true;
    setParade(true);
  }, [mode, seated]);

  // Clocks: online only after handoff idle (turn pushed); AI on the side to move.
  // Debit chessRef.turn() each tick so React turn lag cannot leave White running forever.
  useEffect(() => {
    if (!clockLimit || parade || ending || phase === "over" || phase === "animating") return;
    if (mode === "online") {
      if (handoff !== "idle") return;
      if (!seated) return;
    } else if (mode !== "ai") {
      return;
    }
    const id = window.setInterval(() => {
      const side = chessRef.current.turn() as Side;
      setClocks((c) => {
        const next = Math.max(0, c[side] - 250);
        if (next === 0 && c[side] > 0) {
          window.setTimeout(() => {
            const winner: Side = side === "w" ? "b" : "w";
            setEnding({ kind: "resign", winner });
            setPhase("over");
            if (side === mySide) {
              try {
                p2p.send({ t: "resign" } satisfies NetMsg);
              } catch {
                /* */
              }
            }
          }, 0);
        }
        return { ...c, [side]: next };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [clockLimit, parade, ending, phase, handoff, seated, mySide, p2p, mode, turn]);

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
    if (mode !== "online" || !host || !connectedPeer || didSync.current) return;
    didSync.current = true;
    const msg: NetMsg = {
      t: "sync",
      fen: chessRef.current.fen(),
      setId: prefs.setId,
      boardId: table.board,
      wFaction: table.w,
      bFaction: table.b,
      ...(clockLimit ? { clockSec: clockLimit, clocks: clocksRef.current } : {}),
    };
    p2p.send(msg);
  }, [connectedPeer?.id, host, mode]); // eslint-disable-line

  useEffect(() => {
    if (mode === "online") setOrientation(host ? "w" : "b");
    if (mode === "ai") setOrientation("w");
  }, [mode, host]);

  useEffect(() => {
    if (mode !== "online" || !p2p.table) return;
    const next = parseTable(p2p.table);
    if (!next) return;
    setTable((cur) => {
      const w = next.w || cur.w;
      const board = next.board || cur.board;
      const b = next.b || cur.b;
      if (w === cur.w && b === cur.b && board === cur.board) return cur;
      return { w, b, board };
    });
  }, [mode, p2p.table]);

  useEffect(() => {
    if (mode !== "online" || !host || !room) return;
    void publishMailbox(room, selfId ?? "host", {
      t: "table",
      w: table.w,
      b: table.b,
      board: table.board,
    }).catch(() => {});
  }, [mode, host, room, selfId, table.w, table.b, table.board]);

  useEffect(() => armAudioUnlock(), []);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    let lock: { release: () => Promise<void> } | null = null;
    const arm = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // unsupported or denied
      }
    };
    void arm();
    const onVis = () => {
      if (document.visibilityState === "visible") void arm();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    if (mode !== "online" || !linked || parade || !seated) return;
    flash({ kind: "sat", title: "They sat", body: "The other throne is at the table." }, 2200);
  }, [linked, mode]); // eslint-disable-line

  useEffect(() => {
    if (mode !== "online" || handoff !== "sending") return;
    const push = () => {
      const chess = chessRef.current;
      const last = lastMove;
      const msg: NetMsg = {
        t: "state",
        fen: chess.fen(),
        ply: plyOfFen(chess.fen()),
        from: last?.from,
        to: last?.to,
        wFaction: table.w,
        bFaction: table.b,
        boardId: table.board,
        ...(clockLimit ? { clocks: clocksRef.current } : {}),
      };
      p2p.send(msg);
    };
    push();
    const id = window.setInterval(push, 1400);
    return () => window.clearInterval(id);
  }, [handoff, mode]); // eslint-disable-line

  const canMove = useCallback(
    (color: Side) => {
      if (phase === "over" || phase === "animating" || phase === "promotion" || thinking) return false;
      if (mode === "online" && !seated) return false;
      if (handoff === "ready" || handoff === "sending") return false;
      if (myColor === "both") return true;
      return myColor === color && turn === color;
    },
    [phase, myColor, turn, handoff, mode, seated, thinking],
  );

  function flash(next: NonNullable<Callout>, ms = 2800) {
    window.clearTimeout(calloutTimer.current);
    setCallout(next);
    calloutTimer.current = window.setTimeout(() => setCallout(null), ms);
  }

  useEffect(() => {
    if ((mode !== "online" && mode !== "ai") || ending || handoff !== "idle" || parade) return;
    if (mode === "online" && !seated) return;
    if (myColor !== "both" && turn !== myColor) return;
    const checked = chessRef.current.isCheck();
    const them = myColor === "b" ? wFaction : bFaction;
    const mine = myColor === "b" ? bFaction : wFaction;
    if (incomingPly.current) {
      incomingPly.current = false;
      if (checked) {
        flash({ kind: "check", title: "Check", body: `${them.name} struck.` }, 3200);
      } else {
        flash({ kind: "moved", title: "They moved", body: `${them.name} sent the ply. Your turn.` });
      }
      return;
    }
    if (checked) {
      flash({ kind: "check", title: "Check", body: "Your king is under fire." }, 3200);
    } else {
      flash({ kind: "turn", title: "Your turn", body: `${mine.name} to move.` });
    }
  }, [turn, mode, myColor, handoff, ending, parade]); // eslint-disable-line

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
      setLastMove({ from: move.from, to: move.to, captured: Boolean(move.captured) });
      setHistory((h) => [...h, move]);
    }
  }

  function commitMove(from: Square, to: Square, promotion?: PieceType, remote = false) {
    const chess = chessRef.current;
    // Firm rule: only chess.js-legal moves ever change the table.
    const legalNow = chess.moves({ square: from, verbose: true });
    const ok = legalNow.some(
      (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
    );
    if (!ok) return;
    const move = playMove(chess, from, to, promotion);
    if (!move) return;
    // Flip the turn flag immediately so clocks/labels track chess.js, not the 240ms snapshot delay.
    setTurn(chess.turn());
    setFen(chess.fen());
    setPieces((ps) => applyMoveToPieces(ps, move));
    // Reconcile sprites to FEN so art can never drift into illegal geometry.
    window.setTimeout(() => {
      setPieces((ps) => reconcilePieces(ps, chess.fen()));
    }, 280);
    setSelected(null);
    setLegal([]);
    setCastleRooks([]);
    setCaps([]);
    setPending(null);
    setPhase("animating");
    const kind = chess.isCheck() ? "check" : move.captured ? "capture" : "move";
    if (prefs.sound) playMoveSound(kind);
    playHaptic(kind === "check" ? "check" : kind === "capture" ? "capture" : "move", prefs.haptic);
    window.clearTimeout(impactTimer.current);
    setImpact({ square: to, kind });
    impactTimer.current = window.setTimeout(() => setImpact(null), kind === "capture" ? 1100 : 560);

    // Mover was the side that just moved (turn already flipped in chess.js).
    const mover: Side = chess.turn() === "w" ? "b" : "w";
    const loser: Side = mover === "w" ? "b" : "w";
    if (move.captured) {
      window.clearTimeout(freshCapTimer.current);
      setFreshCap({ side: loser, type: move.captured, key: Date.now() });
      freshCapTimer.current = window.setTimeout(() => setFreshCap(null), 2800);
    }

    window.setTimeout(() => {
      snapshot(chess, move);
      if (mode === "local" && prefs.autoFlip) setOrientation(chess.turn());
      if (chess.isGameOver()) {
        if (prefs.sound) playMoveSound("end");
        playHaptic("end", prefs.haptic);
      }
      if (move.captured && !chess.isGameOver()) {
        const label = PIECE_LABEL[move.captured];
        const lostMine = mode === "local" || loser === mySide;
        if (lostMine) {
          flash(
            {
              kind: "taken",
              title: mode === "local" ? `${label} taken` : "They took a piece",
              body:
                mode === "local"
                  ? `${label} left the table.`
                  : `Your ${label.toLowerCase()} is gone.`,
            },
            3200,
          );
        }
      }
      if (mode === "local" && chess.isCheck() && !chess.isCheckmate()) {
        flash({ kind: "check", title: "Check", body: "The king is under fire." }, 2800);
      }
      if (!remote && mode === "online") {
        setHandoff(chess.isGameOver() ? "sending" : "ready");
        if (chess.isCheck() && !chess.isCheckmate()) {
          flash({ kind: "check", title: "Check", body: "The other king is under fire." }, 2600);
        }
      }
      if (!remote && mode === "ai" && !chess.isGameOver() && chess.turn() === "b") {
        void playAi();
      }
    }, 240);
  }

  function handleNet(msg: NetMsg) {
    const chess = chessRef.current;
    if (msg.t === "sync") {
      if (plyOfFen(msg.fen) < plyOfFen(chess.fen())) return;
      chess.load(msg.fen);
      setPieces((ps) => reconcilePieces(ps, msg.fen));
      setFen(msg.fen);
      setTurn(chess.turn());
      setHistory([]);
      setLastMove(null);
      setEnding(endingOf(chess));
      setPhase("idle");
      applyTheme(msg.setId, msg.boardId, msg.wFaction, msg.bFaction);
      if (typeof msg.clockSec === "number" && msg.clockSec > 0) {
        setClockLimit(msg.clockSec);
        setClocks(msg.clocks ?? { w: msg.clockSec * 1000, b: msg.clockSec * 1000 });
      } else if (msg.clocks) {
        setClocks(msg.clocks);
      }
      return;
    }
    if (msg.t === "move") {
      if (chess.fen() === msg.fen) return;
      if (plyOfFen(msg.fen) < plyOfFen(chess.fen())) return;
      const before = chess.fen();
      commitMove(msg.from as Square, msg.to as Square, msg.promotion, true);
      if (chess.fen() === before && msg.fen !== before) {
        try {
          chess.load(msg.fen);
          setPieces((ps) => reconcilePieces(ps, msg.fen));
          snapshot(chess, null);
          setLastMove({ from: msg.from as Square, to: msg.to as Square });
        } catch {
          // ignore a broken fen
        }
      }
      return;
    }
    if (msg.t === "resign") {
      const winner: Side = host ? "w" : "b";
      setEnding({ kind: "resign", winner });
      setPhase("over");
      return;
    }
    if (msg.t === "reset") {
      incomingPly.current = false;
      reset(msg.fen, true);
      flash({ kind: "turn", title: "Rematch", body: "A new table." }, 2200);
      return;
    }
    if (msg.t === "have") {
      const mine = plyOfFen(chess.fen());
      if (msg.ply >= mine && handoffRef.current === "sending") setHandoff("theirs");
      return;
    }
    if (msg.t === "state") {
      const remotePly = msg.ply ?? plyOfFen(msg.fen);
      const localPly = plyOfFen(chess.fen());
      if (remotePly < localPly) {
        p2p.send({ t: "have", ply: localPly } satisfies NetMsg);
        return;
      }
      if (remotePly === localPly) {
        p2p.send({ t: "have", ply: remotePly } satisfies NetMsg);
        if (handoffRef.current === "sending") setHandoff("theirs");
        return;
      }
      try {
        chess.load(msg.fen);
      } catch {
        return;
      }
      incomingPly.current = true;
      setPieces((ps) => reconcilePieces(ps, msg.fen));
      setFen(msg.fen);
      setTurn(chess.turn());
      const end = endingOf(chess);
      setEnding(end);
      setPhase(end ? "over" : "idle");
      setHandoff("idle");
      if (msg.from && msg.to) setLastMove({ from: msg.from as Square, to: msg.to as Square });
      if (msg.clocks) setClocks(msg.clocks);
      applyTheme(prefs.setId, msg.boardId ?? table.board, msg.wFaction, msg.bFaction);
      p2p.send({ t: "have", ply: remotePly } satisfies NetMsg);
      if (end) {
        if (prefs.sound) playMoveSound("end");
      } else if (prefs.sound) {
        playMoveSound(chess.isCheck() ? "check" : "move");
      }
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


  /** Rook square used to request O-O / O-O-O (avoids fat-finger on g/c files). */
  function castleRookOf(color: Side, move: MoveRec): Square | null {
    const side = castleSideOf(move);
    if (side === "k") return (color === "w" ? "h1" : "h8") as Square;
    if (side === "q") return (color === "w" ? "a1" : "a8") as Square;
    return null;
  }

  function onSquare(sq: Square) {
    unlockAudio();
    const chess = chessRef.current;
    if (phase === "over" || phase === "animating") return;
    if (!canMove(chess.turn())) return;

    if (phase === "selected" && selected) {
      const selPiece = chess.get(selected);
      if (selPiece?.type === "k") {
        const castles = legalMoves(chess, selected).filter((m) => castleSideOf(m));
        const onRook = chess.get(sq);
        // Intentional castle: king selected, then the matching rook.
        if (onRook?.type === "r" && onRook.color === chess.turn() && castleRooks.includes(sq)) {
          const match = castles.find((m) => castleRookOf(selPiece.color as Side, m) === sq);
          if (match) {
            commitMove(selected, match.to);
            return;
          }
        }
        // Never treat g1/c1 (castle landings) as a casual king tap.
        if (castles.some((m) => m.to === sq)) {
          return;
        }
      }

      // Rook squares are NOT normal legal destinations for the king.
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
      if (piece.type === "k") {
        const castles = moves.filter((m) => castleSideOf(m));
        const rest = moves.filter((m) => !castleSideOf(m));
        const rookDots = castles
          .map((m) => castleRookOf(piece.color as Side, m))
          .filter((r): r is Square => r != null);
        setSelected(sq);
        setLegal(rest.filter((m) => !m.captured).map((m) => m.to));
        setCastleRooks(rookDots);
        setCaps(rest.filter((m) => m.captured).map((m) => m.to));
        setPhase("selected");
        return;
      }
      setSelected(sq);
      setLegal(moves.filter((m) => !m.captured).map((m) => m.to));
      setCastleRooks([]);
      setCaps(moves.filter((m) => m.captured).map((m) => m.to));
      setPhase("selected");
      return;
    }
    setSelected(null);
    setLegal([]);
    setCastleRooks([]);
    setCaps([]);
    setPhase("idle");
  }

  function reset(nextFen = START, remote = false) {
    incomingPly.current = false;
    setThinking(false);
    const chess = new Chess(nextFen);
    chessRef.current = chess;
    setFen(chess.fen());
    setPieces((ps) => reconcilePieces(ps, chess.fen()));
    setHistory([]);
    setLastMove(null);
    setSelected(null);
    setLegal([]);
    setCastleRooks([]);
    setCaps([]);
    setPending(null);
    setEnding(null);
    setPhase("idle");
    setTurn(chess.turn());
    setHandoff("idle");
    if (mode === "local") setOrientation("w");
    if (!remote && mode === "online") p2p.send({ t: "reset", fen: chess.fen() } satisfies NetMsg);
  }

  function undo() {
    if (mode === "online" && handoff !== "ready") return;
    const chess = chessRef.current;
    if (mode === "ai") {
      setThinking(false);
      chess.undo();
      if (chess.turn() === "b") chess.undo();
    } else {
      if (mode !== "local" && mode !== "online") return;
      const undone = chess.undo();
      if (!undone) return;
    }
    setPieces((ps) => reconcilePieces(ps, chess.fen()));
    snapshot(chess, null);
    setHistory((h) => (mode === "ai" ? h.slice(0, -2) : h.slice(0, -1)));
    setLastMove(null);
    setHandoff("idle");
    if (mode === "local" && prefs.autoFlip) setOrientation(chess.turn());
  }

  function endTurn() {
    if (mode !== "online") return;
    if (handoff !== "ready" && handoff !== "sending") return;
    setHandoff("sending");
  }

  function playAi() {
    const chess = chessRef.current;
    if (chess.turn() !== "b" || chess.isGameOver()) return;
    setThinking(true);
    flash({ kind: "sat", title: "They think", body: `${bFaction.name} considers the ply.` }, 1600);
    void think(chess.fen(), aiLevel)
      .then((mv) => {
        const now = chessRef.current;
        if (now.turn() !== "b" || now.isGameOver()) return;
        const allowed = now.moves({ verbose: true }).some(
          (m) => m.from === mv.from && m.to === mv.to && (!mv.promotion || m.promotion === mv.promotion),
        );
        if (!allowed) return;
        incomingPly.current = true;
        commitMove(mv.from, mv.to, mv.promotion, true);
      })
      .catch(() => {})
      .finally(() => setThinking(false));
  }

  function sitBlack() {
    const id = otherFaction(table.w, draftBlack);
    setTable((cur) => ({ ...cur, b: id }));
    prefs.setBFaction(id);
    if (room) {
      void publishMailbox(room, selfId ?? "guest", {
        t: "table",
        w: table.w,
        b: id,
        board: table.board,
      }).catch(() => {});
    }
  }

  async function shareRoom() {
    if (!room) return;
    const q = new URLSearchParams(tableQuery(table));
    if (clockLimit > 0) q.set("clock", String(clockLimit));
    const url = `${window.location.origin}/r/${room}?${q.toString()}`;
    const text = table.b
      ? `${wFaction.name} vs ${bFaction.name} — join ${room}`
      : `${wFaction.name} sits white. Pick your host and join ${room}`;
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
  // Prefer FEN side-to-move so chrome never lags a ply behind the engine.
  const liveTurn = (fen.split(" ")[1] === "b" ? "b" : "w") as Side;
  const sideToMove = liveTurn === "w" ? wFaction : bFaction;

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
          <p className="text-xs leading-snug text-muted text-pretty">
            {thinking
              ? `${bFaction.name} considers`
              : ending
              ? endLabel(ending, wFaction.name, bFaction.name)
              : handoff === "ready"
                ? "End turn to send this ply"
                : handoff === "sending"
                  ? "Handing the board across"
                  : handoff === "theirs"
                    ? `${sideToMove.name} has the board`
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
        {mode === "online" && (handoff === "ready" || handoff === "sending") ? (
          <Button
            size="sm"
            className="shrink-0"
            onClick={endTurn}
            disabled={handoff === "sending"}
          >
            <Send className="size-4" />
            {handoff === "sending"
              ? ending
                ? "Sending…"
                : "Sending…"
              : ending
                ? "Send finish"
                : "End turn"}
          </Button>
        ) : (
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-border bg-bg/50"
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
        )}
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-border bg-bg/50"
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
            {handoff === "sending"
              ? "Sending your ply…"
              : connectedPeer || linked
                ? "Phones linked"
                : p2p.joined
                  ? "Waiting for their phone…"
                  : "Opening the table…"}
          </span>
          <button type="button" className="inline-flex items-center gap-1 text-ivory" onClick={shareRoom}>
            <Share2 className="size-3.5" /> Share
          </button>
        </div>
      )}

      {clockLimit > 0 && (mode === "ai" || seated) && (
        <div className="relative z-10 flex shrink-0 items-center justify-center gap-6 px-4 py-1 text-sm tabular-nums">
          <span className={cn(liveTurn === "w" && handoff === "idle" ? "text-gold" : "text-muted")}>
            {wFaction.name} {formatClock(clocks.w)}
          </span>
          <span className={cn(liveTurn === "b" && handoff === "idle" ? "text-ember" : "text-muted")}>
            {bFaction.name} {formatClock(clocks.b)}
          </span>
        </div>
      )}

      <Captured
        row={orientation === "w" ? hellCaps : heavenCaps}
        faction={orientation === "w" ? bFaction : wFaction}
        fresh={freshCap && freshCap.side === (orientation === "w" ? "b" : "w") ? freshCap : null}
      />

      <div className="relative z-10 min-h-0 flex-1 overflow-visible px-1">
        <Board
          fen={fen}
          pieces={pieces}
          orientation={orientation}
          selected={selected}
          legal={[...legal, ...castleRooks]}
          captures={caps}
          lastMove={lastMove}
          impact={impact}
          wFaction={wFaction}
          bFaction={bFaction}
          board={board}
          tilt={prefs.tilt}
          disabled={
            thinking ||
            phase === "over" ||
            handoff === "ready" ||
            handoff === "sending" ||
            (myColor !== "both" && turn !== myColor)
          }
          onSquare={onSquare}
        />
      </div>

      <Captured
        row={orientation === "w" ? heavenCaps : hellCaps}
        faction={orientation === "w" ? wFaction : bFaction}
        fresh={freshCap && freshCap.side === (orientation === "w" ? "w" : "b") ? freshCap : null}
      />

      <footer className="relative z-10 flex shrink-0 items-center gap-2 bg-gradient-to-t from-bg via-bg/80 to-transparent px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1">
        {mode === "online" ? (
          <>
            {handoff === "ready" || handoff === "sending" ? (
              <>
                <p className="min-w-0 flex-1 text-sm leading-snug text-muted text-pretty">
                  {handoff === "sending"
                    ? ending
                      ? "Sending the finish…"
                      : "Handing the board across…"
                    : "Ready to send"}
                </p>
                <Button variant="subtle" size="sm" onClick={undo} disabled={handoff !== "ready"}>
                  <Undo2 className="size-4" /> Undo
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  You are {host ? wFaction.name : bFaction.name}
                  {handoff === "theirs" ? " · their ply" : ""}
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
          </>
        ) : mode === "ai" ? (
          <>
            <p className="min-w-0 flex-1 text-sm leading-snug text-muted text-pretty">
              {thinking ? `${bFaction.name} considers…` : `${wFaction.name} vs ${getAiLevel(aiLevel).name}`}
            </p>
            <Button variant="subtle" size="sm" onClick={undo} disabled={history.length === 0 || thinking}>
              <Undo2 className="size-4" /> Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset()}>
              <RotateCcw className="size-4" /> New
            </Button>
          </>
        ) : (
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
        )}
      </footer>

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

      {callout && (
        <button
          type="button"
          className="absolute inset-x-0 top-[22%] z-40 flex justify-center px-4"
          onClick={() => {
            window.clearTimeout(calloutTimer.current);
            setCallout(null);
          }}
        >
          <div className="panel max-w-sm rounded-[28px] px-8 py-6 text-center">
            <p
              className={cn(
                "text-xs uppercase tracking-[0.28em]",
                callout.kind === "check" || callout.kind === "taken" ? "text-ember" : "text-gold",
              )}
            >
              {callout.kind === "check"
                ? "The king"
                : callout.kind === "taken"
                  ? "Fallen"
                  : callout.kind === "moved"
                    ? "Across the table"
                    : "The table"}
            </p>
            <p
              className={cn(
                "font-display mt-1 text-5xl leading-none",
                callout.kind === "check" || callout.kind === "taken" ? "text-ember" : "text-ivory",
              )}
            >
              {callout.title}
            </p>
            <p className="mt-2 text-sm text-muted">{callout.body}</p>
          </div>
        </button>
      )}

      {ending && handoff !== "ready" && handoff !== "sending" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 p-4">
          <div className="panel w-full max-w-sm rounded-[28px] p-6 text-center">
            <p className="font-display text-3xl">{endTitle(ending, wFaction.name, bFaction.name)}</p>
            <p className="mt-2 text-sm text-muted">{endLabel(ending, wFaction.name, bFaction.name)}</p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={() => reset()}>
                {mode === "online" ? "Rematch" : "Play again"}
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

      {mode === "online" && !seated && host && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-bg/70 p-4 pb-10">
          <div className="panel w-full max-w-md rounded-[28px] p-5 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-gold">You started the duel</p>
            <p className="font-display mt-1 text-4xl">{wFaction.name}</p>
            <p className="mt-3 font-display text-3xl tracking-[0.18em] text-ivory">{room}</p>
            <p className="mt-2 text-sm text-muted text-pretty">
              Share the link (or read them the code). They tap Join a duel, pick an army, then Sit — only then the table
              opens.
            </p>
            <p className="mt-3 text-xs text-gold">
              {connectedPeer || linked
                ? "They’re in — waiting for them to sit…"
                : p2p.joined
                  ? "Waiting for their phone…"
                  : "Opening the table…"}
            </p>
            <Button className="mt-4 w-full" onClick={shareRoom}>
              <Share2 className="size-4" /> Share link
            </Button>
          </div>
        </div>
      )}

      {mode === "online" && !seated && !host && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-bg/90 px-4 py-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="mx-auto max-w-lg pb-8">
            <p className="mb-2 text-center text-xs uppercase tracking-[0.22em] text-gold">Join the duel</p>
            <p className="mb-1 text-center font-display text-2xl tracking-[0.14em]">{room}</p>
            <p className="mb-5 text-center text-sm text-muted text-pretty">
              {connectedPeer || linked
                ? `${wFaction.name} sits white. Pick your army, then sit to open the table.`
                : "Connecting to their phone… you can still pick your army."}
            </p>
            <ArmyPick
              kicker="Your army"
              note={`${wFaction.name} already has white. Choose a different host, then sit.`}
              selected={draftBlack}
              taken={table.w}
              onSelect={setDraftBlack}
              onSit={sitBlack}
              sitLabel={`Sit & play as ${getFaction(draftBlack).name}`}
            />
          </div>
        </div>
      )}

      {parade && (
        <Parade
          first={myFaction}
          second={theirFaction}
          firstSide={mySide}
          secondSide={mySide === "w" ? "b" : "w"}
          board={board}
          onDone={skipParade}
        />
      )}
    </div>
  );
}

function Captured({
  row,
  faction,
  fresh,
}: {
  row: PieceType[];
  faction: Faction;
  fresh: { side: Side; type: PieceType; key: number } | null;
}) {
  return (
    <div className="relative z-10 flex min-h-9 shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-0.5">
      {row.map((piece, i) => {
        const isFresh = Boolean(fresh && i === row.length - 1 && piece === fresh.type);
        return (
          <img
            key={`${piece}-${i}-${isFresh ? fresh!.key : "s"}`}
            src={factionSrc(faction, piece)}
            alt={isFresh ? `${PIECE_LABEL[piece]} taken` : ""}
            className={cn("h-8 w-auto opacity-90", isFresh ? "cap-fresh" : i === row.length - 1 && "cap-in")}
          />
        );
      })}
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
          taken={prefs.bFaction}
          onPick={(id) => {
            prefs.setWFaction(id);
            const p = usePrefs.getState();
            onTheme(p.setId, p.boardId, p.wFaction, p.bFaction);
          }}
        />
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">Black plays as</p>
        <FactionRow
          selected={prefs.bFaction}
          taken={prefs.wFaction}
          onPick={(id) => {
            prefs.setBFaction(id);
            const p = usePrefs.getState();
            onTheme(p.setId, p.boardId, p.wFaction, p.bFaction);
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

        <div className="mt-4">
          <label className="flex items-center justify-between text-sm">
            Sound
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(e) => {
                prefs.setSound(e.target.checked);
                if (e.target.checked) {
                  unlockAudio();
                  playMoveSound("test");
                }
              }}
              className="size-4 accent-ivory"
            />
          </label>
          <p className="mt-1 text-xs text-muted text-pretty">
            Tap the speaker in the header to hear a test. On iPhone, turn the Ring/Silent switch off silent or the table stays quiet.
          </p>
        </div>

        <label className="mt-4 flex items-center justify-between text-sm">
          Haptics
          <input
            type="checkbox"
            checked={prefs.haptic}
            onChange={(e) => prefs.setHaptic(e.target.checked)}
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

function FactionRow({
  selected,
  taken,
  onPick,
}: {
  selected: string;
  taken?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {FACTIONS.map((f) => {
        const sat = taken === f.id;
        return (
          <button
            key={f.id}
            type="button"
            disabled={sat}
            onClick={() => onPick(f.id)}
            className={cn(
              "flex flex-col items-center rounded-[16px] border px-1 py-2",
              sat && "cursor-not-allowed opacity-35",
              !sat && selected === f.id ? "border-ivory bg-surface-2" : "border-border",
            )}
          >
            <img src={factionSrc(f, "k")} alt="" className="h-12 w-auto" />
            <span className="mt-1 text-[11px] font-medium leading-none">{sat ? "Sat" : f.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
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
