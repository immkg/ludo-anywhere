"use client";

// Small synthesized SFX via Web Audio — no binary assets to ship/load.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// A soft, short "plup" — quick descending pitch with a fast decay — played
// each time a token hops onto the next cell along the track.
export function playPlup() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

// A squashed, breathy "smoosh" — filtered noise burst under a fast falling
// pitch — played once, right as a captured token launches off the board and
// starts its retreat back to the yard.
export function playSmoosh() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const noiseLength = audioCtx.sampleRate * 0.18;
  const noiseBuffer = audioCtx.createBuffer(1, noiseLength, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.18);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  noise.connect(filter).connect(noiseGain).connect(audioCtx.destination);

  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(oscGain).connect(audioCtx.destination);

  noise.start(now);
  noise.stop(now + 0.18);
  osc.start(now);
  osc.stop(now + 0.22);
}

// A quick rattle of dice-in-hand clacks — several short, randomly-pitched
// noise ticks in a tight burst — played once as the cube starts spinning.
export function playDiceRoll() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const TICKS = 5;
  for (let i = 0; i < TICKS; i++) {
    const start = now + i * 0.055 + Math.random() * 0.015;

    const clickLength = Math.floor(audioCtx.sampleRate * 0.03);
    const buffer = audioCtx.createBuffer(1, clickLength, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let s = 0; s < clickLength; s++) data[s] = (Math.random() * 2 - 1) * (1 - s / clickLength);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200 + Math.random() * 800;
    filter.Q.value = 1.2;

    const gain = audioCtx.createGain();
    const level = 0.22 * (1 - i / (TICKS + 1));
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);

    source.connect(filter).connect(gain).connect(audioCtx.destination);
    source.start(start);
    source.stop(start + 0.03);
  }
}

// One bright, short bell tone (a fundamental plus a quiet fifth-above
// overtone) — played once when a token reaches its home/finish slot.
export function playHomeChime() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  [{ freq: 880, level: 0.22 }, { freq: 1318.5, level: 0.1 }].forEach(({ freq, level }) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  });
}

// A short triumphant fanfare — a rising major arpeggio landing on a held
// octave — played once when a seat's last token reaches home and they win.
export function playVictoryFanfare() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const start = now + i * 0.11;
    const isLast = i === notes.length - 1;
    const duration = isLast ? 0.6 : 0.16;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.26, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration);

    // A quiet fifth-above shimmer on the held final note only.
    if (isLast) {
      const shimmer = audioCtx.createOscillator();
      const shimmerGain = audioCtx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(freq * 1.5, start);
      shimmerGain.gain.setValueAtTime(0.0001, start);
      shimmerGain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      shimmer.connect(shimmerGain).connect(audioCtx.destination);
      shimmer.start(start);
      shimmer.stop(start + duration);
    }
  });
}
