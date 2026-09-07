/** Light phone haptics for moves. No-ops when unsupported. */
export type HapticKind = "move" | "capture" | "check" | "end";

const PATTERN: Record<HapticKind, number | number[]> = {
  move: 12,
  capture: [10, 30, 18],
  check: [16, 40, 16, 40, 24],
  end: [20, 40, 40],
};

export function playHaptic(kind: HapticKind, enabled = true) {
  if (!enabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERN[kind]);
  } catch {
    /* ignore */
  }
}
