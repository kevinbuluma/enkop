// Optional storm sound, synthesised with Web Audio (no downloads): steady rain from filtered noise with a
// slowly varying patter, and distant thunder after lightning. Off by default; an AudioContext is only
// created and resumed from a visitor's own interaction, so nothing ever plays when a page loads.
import { readStored, writeStored } from '@/lib/safe-storage';

const KEY = 'enkop:rain-sound';

type Graph = { ctx: AudioContext; master: GainNode; noise: AudioBuffer };

let graph: Graph | null = null;
let playing = false;
const listeners = new Set<(on: boolean) => void>();

export const rainSoundPreferred = () => readStored(KEY) === 'on';
export const rainSoundPlaying = () => playing;
export function onRainSoundChange(fn: (on: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = () => listeners.forEach((fn) => fn(playing));

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Pink-ish noise (Paul Kellet's filter) sounds like rain rather than hiss.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
  }
  return buf;
}

function build(): Graph | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const noise = noiseBuffer(ctx, 4);
  const loop = (filter: BiquadFilterNode, gain: number) => {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(master); src.start(0, Math.random() * 3);
    return g;
  };
  const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 5200;
  loop(body, 0.9);
  const patter = ctx.createBiquadFilter(); patter.type = 'bandpass'; patter.frequency.value = 2600; patter.Q.value = 0.7;
  const patterGain = loop(patter, 0.35);
  // A slow wobble so the rain swells and eases rather than droning.
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const depth = ctx.createGain(); depth.gain.value = 0.18;
  lfo.connect(depth); depth.connect(patterGain.gain); lfo.start();
  return { ctx, master, noise };
}

export async function setRainSound(on: boolean) {
  writeStored(KEY, on ? 'on' : 'off');
  if (on) {
    graph ??= build();
    if (!graph) return;
    await graph.ctx.resume().catch(() => {});
    const now = graph.ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(0.16, now, 0.8);
    playing = true;
  } else if (graph) {
    const now = graph.ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(0, now, 0.25);
    playing = false;
    window.setTimeout(() => { if (!playing) graph?.ctx.suspend().catch(() => {}); }, 1200);
  }
  emit();
}

/** Distant thunder after a lightning strike (only while sound is on). */
export function thunder(strength: number, delayMs: number) {
  if (!playing || !graph) return;
  const { ctx, master, noise } = graph;
  const start = ctx.currentTime + delayMs / 1000;
  const src = ctx.createBufferSource(); src.buffer = noise;
  const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 150;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(low); low.connect(g); g.connect(master);
  const peak = 2.4 * Math.min(1, strength);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.35);
  g.gain.setTargetAtTime(peak * 0.45, start + 0.6, 0.4);
  g.gain.setTargetAtTime(0, start + 1.4, 0.9);
  src.start(start, Math.random() * 2, 5);
}

/** A saved "on" preference resumes only after the visitor next interacts with the page. */
export function resumeOnInteraction() {
  if (!rainSoundPreferred() || playing) return () => {};
  const go = (e: Event) => {
    // The sound toggle handles its own click.
    if (e.target instanceof Element && e.target.closest('.rain-sound-toggle')) return;
    cleanup(); setRainSound(true);
  };
  const cleanup = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  addEventListener('pointerdown', go); addEventListener('keydown', go);
  return cleanup;
}

export function stopRainSoundQuietly() {
  if (!graph || !playing) return;
  graph.master.gain.setTargetAtTime(0, graph.ctx.currentTime, 0.3);
  playing = false; emit();
}
