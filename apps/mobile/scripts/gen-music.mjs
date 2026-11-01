// Synthesises Kolab's original music beds (no samples, no licensing): drums, bass and chords
// rendered sample by sample into 4-bar loops. Run: node scripts/gen-music.mjs
import { writeFileSync } from 'node:fs';

const RATE = 22050;
const TAU = Math.PI * 2;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Deterministic noise so regenerating gives identical files.
let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;

function render({ bpm, bars, steps, root, chords, swing = 0, gain = 0.8 }) {
  const beat = 60 / bpm;
  const step = beat / 4;
  const length = Math.round(bars * 4 * beat * RATE);
  const out = new Float32Array(length);
  const add = (start, dur, fn) => {
    const s0 = Math.round(start * RATE);
    const n = Math.round(dur * RATE);
    for (let i = 0; i < n && s0 + i < length; i++) out[s0 + i] += fn(i / RATE, i / n);
  };
  const totalSteps = bars * 16;
  for (let i = 0; i < totalSteps; i++) {
    const p = i % 16;
    const t = i * step + (i % 2 ? swing * step : 0);
    if (steps.kick[p] === 'x') add(t, 0.32, (x, k) => Math.sin(TAU * (50 + 90 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9) * 0.9);
    if (steps.snare[p] === 'x') add(t, 0.2, (x) => (noise() * 0.55 + Math.sin(TAU * 190 * x) * 0.3) * Math.exp(-x * 22));
    if (steps.hat[p] === 'x') add(t, 0.05, (x) => noise() * 0.18 * Math.exp(-x * 90));
    const b = steps.bass[p];
    if (b !== '.') {
      const f = midi(root + Number(b) - 24 + chords[Math.floor(i / 16) % chords.length][0]);
      add(t, step * 1.8, (x, k) => (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * f * 2 * x)) * 0.32 * (1 - k) ** 1.5);
    }
  }
  // Soft chord pad, one chord per bar.
  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    add(bar * 4 * beat, 4 * beat, (x, k) => {
      const env = Math.min(1, x * 6) * (1 - k) ** 0.6;
      return chord.reduce((s, n) => s + Math.sin(TAU * midi(root + n) * x) + 0.25 * Math.sin(TAU * midi(root + n) * 2.01 * x), 0) * 0.045 * env;
    });
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const norm = gain / (peak || 1);
  // Short fades at the loop edges so repeats don't click.
  const fade = Math.round(0.004 * RATE);
  return out.map((v, i) => v * norm * Math.min(1, i / fade, (length - i) / fade));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767, i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const TRACKS = {
  // Chill lo-fi for routines and honest reviews
  glow: {
    bpm: 84, bars: 4, root: 60, swing: 0.18, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]],
    steps: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: '0.....0...0.....' },
  },
  // Bright pop for unboxings and hauls
  pop: {
    bpm: 112, bars: 4, root: 62, chords: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    steps: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: '0..0..0.0..0..0.' },
  },
  // Punchy bounce for hype and transitions
  bounce: {
    bpm: 126, bars: 4, root: 57, chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
    steps: { kick: 'x..x..x...x..x..', snare: '....x.......x..x', hat: 'xxx.xxx.xxx.xxx.', bass: '0.0..0.00.0..0.0' },
  },
};

for (const [name, track] of Object.entries(TRACKS)) {
  const file = new URL(`../assets/music/${name}.wav`, import.meta.url);
  writeFileSync(file, wav(render(track)));
  console.log(`${name}.wav  ${track.bpm} bpm`);
}
