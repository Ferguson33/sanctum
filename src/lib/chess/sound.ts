type Ctor = typeof AudioContext;

function AudioCtx(): Ctor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext || null;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocking: Promise<void> | null = null;

function graph(): AudioContext | null {
  const C = AudioCtx();
  if (!C) return null;
  if (!ctx) {
    ctx = new C({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function unlockAudio() {
  const c = graph();
  if (!c) return;
  if (c.state === "suspended") {
    unlocking = c.resume().then(() => {
      unlocking = null;
    });
  }
}

function whenRunning(play: (c: AudioContext, bus: GainNode) => void) {
  const c = graph();
  if (!c || !master) return;
  const bus = master;
  if (c.state === "running") {
    play(c, bus);
    return;
  }
  unlockAudio();
  const run = () => {
    if (c.state === "running") play(c, bus);
  };
  if (unlocking) void unlocking.then(run);
  else void c.resume().then(run);
}

function env(c: AudioContext, bus: GainNode, peak: number, attack: number, dur: number) {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  o.connect(env(c, bus, peak, 0.008, dur));
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function thud(c: AudioContext, bus: GainNode, freq: number, dur: number, peak: number) {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 6;
  src.connect(bp);
  bp.connect(env(c, bus, peak, 0.004, dur));
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

export function playMoveSound(kind: "move" | "capture" | "check" | "end" | "test") {
  whenRunning((c, bus) => {
    if (kind === "move" || kind === "test") {
      thud(c, bus, 920, 0.07, 0.55);
      tone(c, bus, 220, 0.09, "sine", 0.28);
    } else if (kind === "capture") {
      thud(c, bus, 420, 0.12, 0.7);
      tone(c, bus, 110, 0.16, "sine", 0.4);
      tone(c, bus, 640, 0.06, "square", 0.12);
    } else if (kind === "check") {
      thud(c, bus, 700, 0.1, 0.5);
      tone(c, bus, 660, 0.14, "triangle", 0.28);
      tone(c, bus, 880, 0.18, "sine", 0.2);
    } else {
      tone(c, bus, 330, 0.28, "sine", 0.32);
      tone(c, bus, 196, 0.4, "triangle", 0.24);
      thud(c, bus, 180, 0.22, 0.35);
    }
  });
}

export function armAudioUnlock() {
  if (typeof window === "undefined") return () => {};
  const kick = () => unlockAudio();
  window.addEventListener("pointerdown", kick, { capture: true });
  window.addEventListener("keydown", kick, { capture: true });
  const vis = () => {
    if (document.visibilityState === "visible") unlockAudio();
  };
  document.addEventListener("visibilitychange", vis);
  return () => {
    window.removeEventListener("pointerdown", kick, { capture: true });
    window.removeEventListener("keydown", kick, { capture: true });
    document.removeEventListener("visibilitychange", vis);
  };
}
