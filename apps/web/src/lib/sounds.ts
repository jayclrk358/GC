import type { Prefs } from '@gamecentral/shared';
// The zod-free module: this runs on every page.
import { soundForEvent, type SoundEvent, type SoundPack } from '@gamecentral/shared/prefs-values';

// Game Central's sound effects. Every sound is made on the spot with the Web Audio API from a short
// pattern of notes, voiced differently by each pack, so there are no audio files to download and
// nothing borrowed from anyone else.

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

const CUE_EVENT: Record<SoundCue, SoundEvent> = {
  mention: 'mention',
  notification: 'notification',
  message: 'message',
  send: 'send',
  connect: 'voiceSelf',
  disconnect: 'voiceSelf',
  join: 'voiceOthers',
  leave: 'voiceOthers',
  mute: 'mute',
  unmute: 'mute',
  deafen: 'deafen',
  undeafen: 'deafen',
  celebrate: 'celebrate',
};

/** What each event plays as a sample in settings. */
export const EVENT_SAMPLE: Record<SoundEvent, SoundCue> = {
  mention: 'mention',
  notification: 'notification',
  message: 'message',
  send: 'send',
  voiceSelf: 'connect',
  voiceOthers: 'join',
  mute: 'mute',
  deafen: 'deafen',
  celebrate: 'celebrate',
};

/** One note: semitones above the pack's base, when it starts and how long (seconds). */
interface Note {
  n: number;
  t: number;
  d: number;
  /** Slide to this many semitones by the end. */
  to?: number;
  /** Relative loudness (default 1). */
  v?: number;
}

const PATTERNS: Record<SoundCue, Note[]> = {
  // Rising three notes: someone wants you.
  mention: [
    { n: 0, t: 0, d: 0.08 },
    { n: 7, t: 0.07, d: 0.08 },
    { n: 12, t: 0.14, d: 0.24 },
  ],
  notification: [
    { n: 7, t: 0, d: 0.09 },
    { n: 12, t: 0.09, d: 0.2, v: 0.8 },
  ],
  message: [{ n: 12, t: 0, d: 0.06, v: 0.55 }],
  send: [{ n: 5, t: 0, d: 0.08, to: 12, v: 0.45 }],
  // You: a whole chord up when you connect, down when you leave.
  connect: [
    { n: 0, t: 0, d: 0.09 },
    { n: 4, t: 0.08, d: 0.09 },
    { n: 7, t: 0.16, d: 0.24 },
  ],
  disconnect: [
    { n: 7, t: 0, d: 0.09 },
    { n: 4, t: 0.08, d: 0.09 },
    { n: 0, t: 0.16, d: 0.24 },
  ],
  // Someone else: two notes, up or down.
  join: [
    { n: 4, t: 0, d: 0.08, v: 0.8 },
    { n: 9, t: 0.08, d: 0.16, v: 0.8 },
  ],
  leave: [
    { n: 9, t: 0, d: 0.08, v: 0.8 },
    { n: 4, t: 0.08, d: 0.16, v: 0.8 },
  ],
  mute: [{ n: 0, t: 0, d: 0.09, to: -5, v: 0.75 }],
  unmute: [{ n: -5, t: 0, d: 0.09, to: 0, v: 0.75 }],
  deafen: [
    { n: -2, t: 0, d: 0.07, v: 0.75 },
    { n: -7, t: 0.07, d: 0.13, v: 0.75 },
  ],
  undeafen: [
    { n: -7, t: 0, d: 0.07, v: 0.75 },
    { n: -2, t: 0.07, d: 0.13, v: 0.75 },
  ],
  // A little fanfare for a new community or joining one.
  celebrate: [
    { n: 0, t: 0, d: 0.08 },
    { n: 4, t: 0.07, d: 0.08 },
    { n: 7, t: 0.14, d: 0.08 },
    { n: 12, t: 0.21, d: 0.32 },
    { n: 16, t: 0.21, d: 0.32, v: 0.45 },
  ],
};

/** How a pack voices the notes. */
interface Voice {
  /** Frequency of semitone 0, in hertz. */
  base: number;
  wave: OscillatorType;
  /** Extra sine partials: [frequency ratio, loudness]. */
  partials: [number, number][];
  attack: number;
  release: number;
  /** Stretches (>1) or tightens (<1) the timing. */
  speed: number;
  gain: number;
}

const PACKS: Record<SoundPack, Voice> = {
  // Bright and clear, with a slight chorus shimmer.
  gamecentral: {
    base: 587.33,
    wave: 'triangle',
    partials: [
      [2 ** (7 / 1200), 0.45],
      [2, 0.16],
    ],
    attack: 0.005,
    release: 0.2,
    speed: 1,
    gain: 0.9,
  },
  // Low, round and quiet.
  soft: {
    base: 392,
    wave: 'sine',
    partials: [[2, 0.08]],
    attack: 0.025,
    release: 0.32,
    speed: 1.25,
    gain: 0.85,
  },
  // Square-wave chiptune, quick.
  arcade: {
    base: 523.25,
    wave: 'square',
    partials: [],
    attack: 0.002,
    release: 0.05,
    speed: 0.7,
    gain: 0.32,
  },
  // Glassy bells with long tails.
  crystal: {
    base: 880,
    wave: 'sine',
    partials: [
      [2.76, 0.32],
      [5.4, 0.12],
    ],
    attack: 0.003,
    release: 0.65,
    speed: 1.1,
    gain: 0.7,
  },
};

type SoundPrefs = Pick<Prefs, 'sounds' | 'soundPack' | 'soundVolume' | 'soundEvents'>;

let prefs: SoundPrefs | null = null;
let ctx: AudioContext | null = null;

/** Called with the current preferences whenever they change (see PrefsProvider). */
export function configureSounds(next: SoundPrefs): void {
  prefs = next;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Browsers only let a page make sound after someone has interacted with it: get the audio ready
 * on the first click or key press, so a later notification can be heard.
 */
export function unlockSoundsOnInteraction(): () => void {
  const unlock = () => {
    if (!prefs?.sounds) return;
    if (audio()?.state === 'running') remove();
  };
  const remove = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return remove;
}

function render(cue: SoundCue, pack: SoundPack, volume: number): void {
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'running') {
    draw(ac, cue, pack, volume);
    return;
  }
  // Not started yet. Without any interaction on the page it can't be, so stay quiet rather
  // than play this late, on the next click. Otherwise it's starting now: play once it has.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const asked = performance.now();
  void ac
    .resume()
    .then(() => {
      if (ac.state === 'running' && performance.now() - asked < 500) draw(ac, cue, pack, volume);
    })
    .catch(() => {});
}

function draw(ac: AudioContext, cue: SoundCue, pack: SoundPack, volume: number): void {
  const voice = PACKS[pack];
  const out = ac.createGain();
  // Effects sit well under speech and music: full volume is still gentle.
  out.gain.value = (volume / 100) * 0.22 * voice.gain;
  const limiter = ac.createDynamicsCompressor();
  out.connect(limiter).connect(ac.destination);
  const start = ac.currentTime + 0.01;
  let end = start;
  for (const note of PATTERNS[cue]) {
    const at = start + note.t * voice.speed;
    const length = note.d * voice.speed;
    const freq = voice.base * 2 ** (note.n / 12);
    const target = note.to === undefined ? null : voice.base * 2 ** (note.to / 12);
    const stop = at + length + voice.release;
    end = Math.max(end, stop);
    for (const [ratio, loudness] of [[1, 1], ...voice.partials] as [number, number][]) {
      const osc = ac.createOscillator();
      osc.type = ratio === 1 ? voice.wave : 'sine';
      osc.frequency.setValueAtTime(freq * ratio, at);
      if (target) osc.frequency.exponentialRampToValueAtTime(target * ratio, at + length);
      const env = ac.createGain();
      const peak = (note.v ?? 1) * loudness;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(peak, at + voice.attack);
      env.gain.setValueAtTime(peak, at + length);
      env.gain.exponentialRampToValueAtTime(0.0001, stop);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(stop + 0.02);
    }
  }
  // Tidy up the graph once it's done.
  setTimeout(() => out.disconnect(), (end - ac.currentTime + 0.2) * 1000);
}

/**
 * Play a sound if the person wants that one. Pass `key` for things every open tab hears about
 * (a notification, someone joining): only one tab then plays it.
 */
export function playSound(cue: SoundCue, key?: string): void {
  if (!prefs) return;
  const pack = soundForEvent(prefs, CUE_EVENT[cue]);
  if (!pack) return;
  const volume = prefs.soundVolume;
  if (!key || typeof navigator === 'undefined' || !navigator.locks) {
    render(cue, pack, volume);
    return;
  }
  // The first tab to claim it plays it; the claim is held a few seconds so the others,
  // hearing about the same thing a moment later, stay quiet.
  void navigator.locks
    .request(`mx-sound:${key}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      render(cue, pack, volume);
      await new Promise((r) => setTimeout(r, 4000));
    })
    .catch(() => {});
}

/** For settings: play a cue in a given pack and volume, whatever the saved choices are. */
export function previewSound(cue: SoundCue, pack: SoundPack, volume: number): void {
  render(cue, pack, volume);
}
