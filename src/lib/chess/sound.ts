type Ctor = typeof AudioContext;

function AudioCtx(): Ctor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ||
    null
  );
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocked = false;

function ensureGraph(): AudioContext | null {
  const C = AudioCtx();
  if (!C) return null;
  if (!ctx) {
    ctx = new C({ latencyHint: "interactive" });
    master = ctx.createGain();
    // Hot enough to hear on phone speakers; still short SFX.
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Soft noise with a little grit (stone / ember).
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
  }
  return ctx;
}

/** Play a near-silent buffer — required for iOS to truly unlock Web Audio. */
function primeUnlock(c: AudioContext) {
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* */
  }
}

/**
 * Must run inside a user gesture (tap). Creates/resumes the AudioContext and
 * primes iOS so later move SFX are not silently dropped.
 */
export function unlockAudio(): void {
  const c = ensureGraph();
  if (!c) return;
  primeUnlock(c);
  if (c.state === "suspended") {
    void c.resume().then(() => {
      unlocked = c.state === "running";
    });
  } else {
    unlocked = true;
  }
}

export function audioUnlocked(): boolean {
  return unlocked && !!ctx && ctx.state === "running";
}

function whenRunning(play: (c: AudioContext, bus: GainNode) => void) {
  const c = ensureGraph();
  if (!c || !master) return;
  const bus = master;
  const go = () => {
    if (c.state === "running") play(c, bus);
  };
  if (c.state === "running") {
    go();
    return;
  }
  // Best-effort resume (may no-op outside a gesture); gesture path uses unlockAudio.
  primeUnlock(c);
  void c.resume().then(() => {
    unlocked = c.state === "running";
    go();
  });
}

function env(
  c: AudioContext,
  bus: GainNode,
  peak: number,
  attack: number,
  dur: number,
  curve: "exp" | "lin" = "exp",
) {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  if (curve === "exp") {
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
  g.connect(bus);
  return g;
}

function tone(
  c: AudioContext,
  bus: GainNode,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  slideTo?: number,
) {
  const o = c.createOscillator();
  o.type = type;
  const t = c.currentTime;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), t + dur * 0.9);
  o.connect(env(c, bus, peak, 0.01, dur));
  o.start();
  o.stop(t + dur + 0.03);
}

function thud(c: AudioContext, bus: GainNode, freq: number, dur: number, peak: number) {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "lowpass";
  bp.frequency.value = freq;
  bp.Q.value = 0.7;
  src.connect(bp);
  bp.connect(env(c, bus, peak, 0.005, dur, "lin"));
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

function shimmer(c: AudioContext, bus: GainNode, freq: number, dur: number, peak: number) {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 4;
  src.connect(bp);
  bp.connect(env(c, bus, peak, 0.008, dur));
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

/** Sanctum table voice — stone settle, ember take, alarm check, throne fall. */
export function playMoveSound(kind: "move" | "capture" | "check" | "end" | "test") {
  whenRunning((c, bus) => {
    if (kind === "move" || kind === "test") {
      // Soft stone settle + low table resonance.
      thud(c, bus, 380, 0.09, 0.62);
      tone(c, bus, 196, 0.12, "sine", 0.3, 165);
      shimmer(c, bus, 1400, 0.05, 0.12);
    } else if (kind === "capture") {
      // Ember crack + heavier drop.
      thud(c, bus, 220, 0.16, 0.8);
      shimmer(c, bus, 900, 0.1, 0.35);
      tone(c, bus, 98, 0.2, "sine", 0.38, 70);
      tone(c, bus, 520, 0.07, "triangle", 0.14);
    } else if (kind === "check") {
      // Bright warning fifth.
      thud(c, bus, 500, 0.1, 0.45);
      tone(c, bus, 554, 0.16, "triangle", 0.32);
      tone(c, bus, 830, 0.2, "sine", 0.26);
      shimmer(c, bus, 1600, 0.12, 0.18);
    } else {
      // Throne settles — descending open fifth.
      tone(c, bus, 392, 0.35, "sine", 0.34, 262);
      tone(c, bus, 262, 0.45, "triangle", 0.28, 196);
      thud(c, bus, 140, 0.28, 0.4);
    }
  });
}

/** Keep the context alive across the session; call once from the game shell. */
export function armAudioUnlock() {
  if (typeof window === "undefined") return () => {};
  const kick = () => unlockAudio();
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("pointerdown", kick, opts);
  window.addEventListener("touchstart", kick, opts);
  window.addEventListener("keydown", kick, opts);
  const vis = () => {
    if (document.visibilityState === "visible") unlockAudio();
  };
  document.addEventListener("visibilitychange", vis);
  return () => {
    window.removeEventListener("pointerdown", kick, opts);
    window.removeEventListener("touchstart", kick, opts);
    window.removeEventListener("keydown", kick, opts);
    document.removeEventListener("visibilitychange", vis);
  };
}
