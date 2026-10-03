// Game Central's sound effects, designed in code. Each pack is an instrument (glass mallets, felt
// keys, a chiptune voice, bells) that plays each cue's short phrase, with touches like a soft
// click, a breath of noise or a muffling filter, then a little room echo. A sound is rendered once
// into a buffer (see sounds.ts), then levelled so every pack is as loud as the others.

import type { SoundPack } from '@gamecentral/shared/prefs-values';

/** Things that make a sound. Several share a setting (joining and leaving a call, say). */
export type SoundCue =
  | 'mention'
  | 'notification'
  | 'message'
  | 'send'
  | 'connect'
  | 'disconnect'
  | 'join'
  | 'leave'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'celebrate';

/** One note: semitones above the pack's base, when it starts and how long it's held (seconds). */
export interface Note {
  n: number;
  t: number;
  d: number;
  /** Glide to this many semitones by the end of the note. */
  to?: number;
  /** Relative loudness (default 1). */
  v?: number;
  /** Left (-1) to right (1). */
  pan?: number;
}

interface CueDesign {
  notes: Note[];
  /** High, quiet bell notes on top, whatever the pack. */
  sparkle?: Note[];
  /** A burst of filtered noise: a click (mute) or a breath (sending). Band centre in hertz. */
  noise?: { t: number; d: number; from: number; to: number; v: number; q: number };
  /** A low-pass filter moving over the whole sound, in hertz (muffling, or opening up). */
  sweep?: { from: number; to: number };
  /** Loudness after levelling: the frequent ones are quieter. */
  level: number;
}

export const CUES: Record<SoundCue, CueDesign> = {
  // Someone wants you: up a fifth to the octave, with a glint on top.
  mention: {
    notes: [
      { n: 7, t: 0, d: 0.1 },
      { n: 12, t: 0.09, d: 0.32 },
    ],
    sparkle: [{ n: 24, t: 0.09, d: 0.3, v: 0.5 }],
    level: 1,
  },
  // Gentler: down a fourth.
  notification: {
    notes: [
      { n: 12, t: 0, d: 0.1 },
      { n: 7, t: 0.11, d: 0.3, v: 0.85 },
    ],
    level: 0.85,
  },
  // A soft bubble.
  message: {
    notes: [{ n: 19, t: 0, d: 0.07, to: 12, v: 0.9 }],
    level: 0.6,
  },
  // A breath out and a little lift.
  send: {
    notes: [{ n: 12, t: 0.02, d: 0.06, to: 19, v: 0.55 }],
    noise: { t: 0, d: 0.09, from: 900, to: 5000, v: 0.35, q: 1.2 },
    level: 0.5,
  },
  // You: a major chord rising when you connect, falling when you leave.
  connect: {
    notes: [
      { n: 0, t: 0, d: 0.1 },
      { n: 4, t: 0.07, d: 0.1 },
      { n: 7, t: 0.14, d: 0.1 },
      { n: 12, t: 0.21, d: 0.34 },
    ],
    level: 0.9,
  },
  disconnect: {
    notes: [
      { n: 12, t: 0, d: 0.1 },
      { n: 7, t: 0.08, d: 0.1 },
      { n: 0, t: 0.16, d: 0.34, v: 0.9 },
    ],
    level: 0.85,
  },
  // Someone else: two notes, up or down.
  join: {
    notes: [
      { n: 5, t: 0, d: 0.09, v: 0.85 },
      { n: 12, t: 0.09, d: 0.22 },
    ],
    level: 0.75,
  },
  leave: {
    notes: [
      { n: 12, t: 0, d: 0.09 },
      { n: 5, t: 0.09, d: 0.22, v: 0.85 },
    ],
    level: 0.7,
  },
  // A switch: a click with a short drop (off) or lift (on).
  mute: {
    notes: [{ n: 0, t: 0.005, d: 0.07, to: -7, v: 0.8 }],
    noise: { t: 0, d: 0.018, from: 3200, to: 2200, v: 0.5, q: 2 },
    level: 0.7,
  },
  unmute: {
    notes: [{ n: -7, t: 0.005, d: 0.07, to: 0, v: 0.8 }],
    noise: { t: 0, d: 0.018, from: 2200, to: 3200, v: 0.5, q: 2 },
    level: 0.7,
  },
  // The world going muffled, or coming back.
  deafen: {
    notes: [
      { n: -3, t: 0, d: 0.09 },
      { n: -10, t: 0.09, d: 0.2 },
    ],
    sweep: { from: 6000, to: 500 },
    level: 0.75,
  },
  undeafen: {
    notes: [
      { n: -10, t: 0, d: 0.09 },
      { n: -3, t: 0.09, d: 0.2 },
    ],
    sweep: { from: 500, to: 8000 },
    level: 0.75,
  },
  // A little fanfare: up the chord, a held chord, and sparkles across the room.
  celebrate: {
    notes: [
      { n: 0, t: 0, d: 0.07 },
      { n: 4, t: 0.06, d: 0.07 },
      { n: 7, t: 0.12, d: 0.07 },
      { n: 12, t: 0.18, d: 0.45 },
      { n: 16, t: 0.18, d: 0.45, v: 0.55 },
      { n: 19, t: 0.18, d: 0.45, v: 0.45 },
    ],
    sparkle: [
      { n: 31, t: 0.24, d: 0.2, v: 0.4, pan: -0.6 },
      { n: 28, t: 0.32, d: 0.2, v: 0.35, pan: 0.6 },
      { n: 36, t: 0.4, d: 0.25, v: 0.3, pan: -0.2 },
    ],
    noise: { t: 0.16, d: 0.35, from: 6000, to: 9000, v: 0.12, q: 0.7 },
    level: 1,
  },
};

type Voice = (ac: BaseAudioContext, out: AudioNode, note: PlayedNote) => void;

interface PlayedNote {
  freq: number;
  /** Frequency to glide to, if any. */
  to: number | null;
  at: number;
  length: number;
  velocity: number;
  /** Seconds the sound rings on after the note. */
  tail: number;
}

interface Instrument {
  /** Frequency of semitone 0, in hertz. */
  base: number;
  /** Stretches (>1) or tightens (<1) the timing. */
  speed: number;
  /** How long notes ring on. */
  tail: number;
  voice: Voice;
  /** Mallet click at the start of each note (0 for none). */
  click: number;
  room: { wet: number; seconds: number };
  echo?: { time: number; feedback: number; wet: number };
}

const SILENT = 0.0001;

/** An envelope on `gain`: up quickly, decaying through the note, ringing out over the tail. */
function strike(gain: AudioParam, note: PlayedNote, attack: number, sustain: number): void {
  const { at, length, velocity, tail } = note;
  gain.setValueAtTime(0, at);
  gain.linearRampToValueAtTime(velocity, at + attack);
  gain.exponentialRampToValueAtTime(Math.max(velocity * sustain, SILENT), at + length);
  gain.exponentialRampToValueAtTime(SILENT, at + length + tail);
}

/** A frequency modulation pair: bright as it's struck, mellowing as the modulation fades. */
function fm(
  ac: BaseAudioContext,
  out: AudioNode,
  note: PlayedNote,
  opts: { ratio: number; index: number; fade: number; attack: number; sustain: number },
): void {
  const { freq, to, at, length, tail } = note;
  const end = at + length + tail;
  const carrier = ac.createOscillator();
  const modulator = ac.createOscillator();
  const depth = ac.createGain();
  carrier.frequency.setValueAtTime(freq, at);
  modulator.frequency.setValueAtTime(freq * opts.ratio, at);
  if (to) {
    carrier.frequency.exponentialRampToValueAtTime(to, at + length);
    modulator.frequency.exponentialRampToValueAtTime(to * opts.ratio, at + length);
  }
  depth.gain.setValueAtTime(freq * opts.index, at);
  depth.gain.exponentialRampToValueAtTime(freq * opts.index * 0.02, at + opts.fade);
  modulator.connect(depth).connect(carrier.frequency);
  const amp = ac.createGain();
  strike(amp.gain, note, opts.attack, opts.sustain);
  carrier.connect(amp).connect(out);
  for (const osc of [carrier, modulator]) {
    osc.start(at);
    osc.stop(end + 0.05);
  }
}

/** A plain partial (sine), for brightness on top of a voice. */
function partial(
  ac: BaseAudioContext,
  out: AudioNode,
  note: PlayedNote,
  ratio: number,
  loudness: number,
  tail: number,
): void {
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(note.freq * ratio, note.at);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to * ratio, note.at + note.length);
  const amp = ac.createGain();
  strike(amp.gain, { ...note, velocity: note.velocity * loudness, tail }, 0.002, 0.2);
  osc.connect(amp).connect(out);
  osc.start(note.at);
  osc.stop(note.at + note.length + tail + 0.05);
}

const glass: Voice = (ac, out, note) => {
  fm(ac, out, note, { ratio: 2, index: 1.4, fade: 0.16, attack: 0.003, sustain: 0.45 });
  partial(ac, out, note, 4, 0.12, note.tail * 0.4);
};

const felt: Voice = (ac, out, note) => {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(note.freq * 4, 2400), note.at);
  filter.Q.value = 0.4;
  filter.connect(out);
  // Two sines a few cents apart, for warmth, and a soft triangle underneath.
  for (const [cents, type, loud] of [
    [-5, 'sine', 0.55],
    [5, 'sine', 0.55],
    [0, 'triangle', 0.35],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(note.freq, note.at);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, note.at + note.length);
    const amp = ac.createGain();
    strike(amp.gain, { ...note, velocity: note.velocity * loud }, 0.014, 0.55);
    osc.connect(amp).connect(filter);
    osc.start(note.at);
    osc.stop(note.at + note.length + note.tail + 0.05);
  }
};

/** A 25% pulse, the classic handheld-console voice. */
function pulseWave(ac: BaseAudioContext): PeriodicWave {
  const size = 32;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let k = 1; k < size; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  return ac.createPeriodicWave(real, imag);
}

const chip: Voice = (ac, out, note) => {
  const { freq, to, at, length, velocity, tail } = note;
  const osc = ac.createOscillator();
  osc.setPeriodicWave(pulseWave(ac));
  // Pitch and volume move in steps, a frame at a time, as old consoles did.
  const frame = 1 / 60;
  const steps = Math.max(1, Math.round(length / frame));
  for (let i = 0; i <= steps; i++) {
    const f = to ? freq * (to / freq) ** (i / steps) : freq;
    osc.frequency.setValueAtTime(f, at + i * frame);
  }
  const amp = ac.createGain();
  const levels = [1, 0.85, 0.7, 0.6, 0.5, 0.4];
  amp.gain.setValueAtTime(0, at);
  levels.forEach((l, i) => {
    if (i * frame * 2 < length) amp.gain.setValueAtTime(velocity * l, at + i * frame * 2);
  });
  amp.gain.setValueAtTime(velocity * 0.35, at + length);
  amp.gain.setValueAtTime(0, at + length + Math.min(tail, 0.03));
  osc.connect(amp).connect(out);
  osc.start(at);
  osc.stop(at + length + tail + 0.05);
};

const bell: Voice = (ac, out, note) => {
  fm(ac, out, note, { ratio: 3.5, index: 2.2, fade: 0.9, attack: 0.002, sustain: 0.6 });
  partial(ac, out, note, 2.76, 0.18, note.tail * 0.7);
};

const PACKS: Record<SoundPack, Instrument> = {
  gamecentral: {
    base: 587.33,
    speed: 1,
    tail: 0.42,
    voice: glass,
    click: 0.12,
    room: { wet: 0.16, seconds: 0.9 },
  },
  soft: {
    base: 392,
    speed: 1.2,
    tail: 0.55,
    voice: felt,
    click: 0,
    room: { wet: 0.22, seconds: 1.3 },
  },
  arcade: {
    base: 523.25,
    speed: 0.75,
    tail: 0.03,
    voice: chip,
    click: 0,
    room: { wet: 0, seconds: 0 },
    echo: { time: 0.085, feedback: 0.3, wet: 0.28 },
  },
  crystal: {
    base: 880,
    speed: 1.1,
    tail: 1.2,
    voice: bell,
    click: 0.05,
    room: { wet: 0.3, seconds: 1.8 },
  },
};

/** White noise, `seconds` long, the same every time (so a sound never changes). */
function noiseBuffer(ac: BaseAudioContext, seconds: number, channels = 1): AudioBuffer {
  const buffer = ac.createBuffer(
    channels,
    Math.max(1, Math.ceil(seconds * ac.sampleRate)),
    ac.sampleRate,
  );
  let seed = 0x9e3779b9;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
  }
  return buffer;
}

/** A small room: a stereo burst of noise fading away, darker as it goes. */
function roomImpulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const ir = noiseBuffer(ac, seconds, 2);
  const preDelay = Math.round(0.012 * ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ac.sampleRate;
      // Dull the high end over time, as a real room does.
      const k = 0.55 - 0.4 * Math.min(1, t / seconds);
      smooth += k * ((data[i] ?? 0) - smooth);
      data[i] = i < preDelay ? 0 : smooth * Math.exp((-6.9 * t) / seconds);
    }
  }
  return ir;
}

function noiseBurst(
  ac: BaseAudioContext,
  out: AudioNode,
  burst: NonNullable<CueDesign['noise']>,
  start: number,
  speed: number,
): void {
  const at = start + burst.t * speed;
  const length = burst.d * speed;
  const source = ac.createBufferSource();
  source.buffer = noiseBuffer(ac, length + 0.02);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = burst.q;
  band.frequency.setValueAtTime(burst.from, at);
  band.frequency.exponentialRampToValueAtTime(burst.to, at + length);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(burst.v, at + Math.min(0.004, length / 4));
  amp.gain.exponentialRampToValueAtTime(SILENT, at + length);
  source.connect(band).connect(amp).connect(out);
  source.start(at);
  source.stop(at + length + 0.02);
}

/** How long a cue lasts in a pack, ring and echo included (seconds). */
export function cueLength(cue: SoundCue, pack: SoundPack): number {
  const design = CUES[cue];
  const inst = PACKS[pack];
  const notes = [...design.notes, ...(design.sparkle ?? [])];
  const last = Math.max(...notes.map((n) => (n.t + n.d) * inst.speed));
  const echo = inst.echo ? inst.echo.time * 6 : 0;
  const sparkleTail = design.sparkle ? PACKS.crystal.tail : 0;
  return Math.min(2.6, 0.02 + last + Math.max(inst.tail, sparkleTail) + inst.room.seconds + echo);
}

/** Lay out a cue, played by a pack's instrument, in an (offline) audio context. */
export function buildCue(ac: BaseAudioContext, cue: SoundCue, pack: SoundPack): void {
  const design = CUES[cue];
  const inst = PACKS[pack];
  const start = 0.01;
  const total = cueLength(cue, pack);

  // dry + room (+ echo) → muffling filter → out
  const output = ac.createGain();
  let destination: AudioNode = output;
  if (design.sweep) {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(design.sweep.from, start);
    filter.frequency.exponentialRampToValueAtTime(design.sweep.to, start + total * 0.6);
    output.connect(filter);
    destination = filter;
  }
  destination.connect(ac.destination);
  const dry = ac.createGain();
  dry.connect(output);
  if (inst.room.wet > 0) {
    const room = ac.createConvolver();
    room.buffer = roomImpulse(ac, inst.room.seconds);
    const wet = ac.createGain();
    wet.gain.value = inst.room.wet;
    dry.connect(room).connect(wet).connect(output);
  }
  if (inst.echo) {
    const delay = ac.createDelay(1);
    delay.delayTime.value = inst.echo.time;
    const feedback = ac.createGain();
    feedback.gain.value = inst.echo.feedback;
    const wet = ac.createGain();
    wet.gain.value = inst.echo.wet;
    dry.connect(delay).connect(feedback).connect(delay);
    delay.connect(wet).connect(output);
  }

  const play = (note: Note, voice: Voice, base: number, tail: number) => {
    const pan = ac.createStereoPanner();
    pan.pan.value = note.pan ?? 0;
    pan.connect(dry);
    voice(ac, pan, {
      freq: base * 2 ** (note.n / 12),
      to: note.to === undefined ? null : base * 2 ** (note.to / 12),
      at: start + note.t * inst.speed,
      length: note.d * inst.speed,
      velocity: note.v ?? 1,
      tail,
    });
    if (inst.click > 0) {
      noiseBurst(
        ac,
        pan,
        { t: note.t, d: 0.006, from: 5000, to: 3500, v: inst.click * (note.v ?? 1), q: 1.5 },
        start,
        inst.speed,
      );
    }
  };
  for (const note of design.notes) play(note, inst.voice, inst.base, inst.tail);
  // Sparkles are bells (chiptune blips in the arcade pack), pitched from the pack's base.
  const sparkle = pack === 'arcade' ? chip : bell;
  for (const note of design.sparkle ?? []) play(note, sparkle, inst.base / 2, PACKS.crystal.tail);
  if (design.noise) noiseBurst(ac, dry, design.noise, start, inst.speed);
}

/**
 * Level a rendered sound: its loudest tenth of a second is brought to `targetRms`, without the
 * peak going over `maxPeak`, then scaled by the cue's level. Changes `channels` in place.
 */
export function levelSound(
  channels: Float32Array[],
  sampleRate: number,
  level: number,
  targetRms = 0.2,
  maxPeak = 0.9,
): number {
  const length = channels[0]?.length ?? 0;
  const window = Math.max(1, Math.round(sampleRate * 0.1));
  let peak = 0;
  const energy = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    let e = 0;
    for (const data of channels) {
      const x = data[i] ?? 0;
      e += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
    energy[i] = e / channels.length;
  }
  // Whole windows only (or the whole sound, if it's shorter than one).
  const span = Math.min(window, length);
  let sum = 0;
  let loudest = 0;
  for (let i = 0; i < length; i++) {
    sum += energy[i] ?? 0;
    if (i >= span) sum -= energy[i - span] ?? 0;
    if (i >= span - 1) loudest = Math.max(loudest, sum / span);
  }
  const rms = Math.sqrt(loudest);
  if (rms === 0 || peak === 0) return 0;
  const gain = Math.min(targetRms / rms, maxPeak / peak) * level;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * gain;
  }
  return gain;
}

/**
 * How much of a rendered sound to keep: up to where it has faded below hearing (the room's tail
 * goes on long after), with a few milliseconds' fade so it doesn't end in a click. Fades the end
 * of `channels` in place and returns the number of samples to keep.
 */
export function audibleLength(
  channels: Float32Array[],
  sampleRate: number,
  floor = 0.0005,
): number {
  const length = channels[0]?.length ?? 0;
  let last = 0;
  for (const data of channels) {
    for (let i = length - 1; i > last; i--) {
      if (Math.abs(data[i] ?? 0) > floor) {
        last = i;
        break;
      }
    }
  }
  const fade = Math.round(sampleRate * 0.005);
  const keep = Math.min(length, last + fade);
  for (const data of channels) {
    for (let i = Math.max(0, keep - fade); i < keep; i++) {
      data[i] = (data[i] ?? 0) * ((keep - i) / fade);
    }
  }
  return keep;
}
