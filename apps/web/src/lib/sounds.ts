import type { Prefs } from '@gamecentral/shared';
// The zod-free module: this runs on every page.
import { soundForEvent, type SoundEvent, type SoundPack } from '@gamecentral/shared/prefs-values';
import {
  audibleLength,
  buildCue,
  CUES,
  cueLength,
  levelSound,
  type SoundCue,
} from './sound-design';

// Game Central's sound effects: designed in code (sound-design.ts), rendered the first time
// they're needed, then played straight from memory. There are no audio files to download and
// nothing borrowed from anyone else.

export type { SoundCue };

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

type SoundPrefs = Pick<Prefs, 'sounds' | 'soundPack' | 'soundVolume' | 'soundEvents'>;

let prefs: SoundPrefs | null = null;
let ctx: AudioContext | null = null;

/** Called with the current preferences whenever they change (see PrefsProvider). */
export function configureSounds(next: SoundPrefs): void {
  prefs = next;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (typeof OfflineAudioContext === 'undefined') return null;
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
    if (audio()?.state === 'running') {
      remove();
      warmUp(prefs.soundPack);
    }
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

const rendered = new Map<string, Promise<AudioBuffer | null>>();
/** 32 kHz covers everything in these sounds, in two thirds of the memory of 48 kHz. */
const RATE = 32000;

/** A cue in a pack, rendered once and kept (the most recent couple of dozen). */
function bufferFor(cue: SoundCue, pack: SoundPack): Promise<AudioBuffer | null> {
  const key = `${cue}:${pack}`;
  let buffer = rendered.get(key);
  if (buffer) {
    // Most recently used goes to the back of the queue.
    rendered.delete(key);
  } else {
    buffer = renderCue(RATE, cue, pack).catch(() => null);
  }
  rendered.set(key, buffer);
  if (rendered.size > 24) rendered.delete(rendered.keys().next().value as string);
  return buffer;
}

async function renderCue(sampleRate: number, cue: SoundCue, pack: SoundPack): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(cueLength(cue, pack) * sampleRate),
    sampleRate,
  });
  buildCue(offline, cue, pack);
  const buffer = await offline.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  levelSound(channels, sampleRate, CUES[cue].level);
  // Only as long as it can be heard: the room's tail goes on long after.
  const keep = audibleLength(channels, sampleRate);
  if (keep >= buffer.length) return buffer;
  const trimmed = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, keep), sampleRate });
  channels.forEach((data, c) => trimmed.copyToChannel(data.subarray(0, keep), c));
  return trimmed;
}

function draw(ac: AudioContext, cue: SoundCue, pack: SoundPack, volume: number): void {
  const asked = performance.now();
  void bufferFor(cue, pack).then((buffer) => {
    // Rendering takes a few milliseconds the first time; much later than asked, it's stale.
    if (!buffer || performance.now() - asked > 600) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const out = ac.createGain();
    // Effects sit well under speech and music: full volume is still gentle.
    out.gain.value = (volume / 100) * 0.45;
    source.connect(out).connect(ac.destination);
    source.onended = () => out.disconnect();
    source.start();
  });
}

/** The sounds heard most, rendered ahead of time so the first one is instant. */
const FREQUENT: SoundCue[] = ['message', 'send', 'mention', 'notification', 'mute', 'unmute'];

function warmUp(pack: SoundPack): void {
  if (typeof OfflineAudioContext === 'undefined') return;
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => {
    for (const cue of FREQUENT) void bufferFor(cue, pack);
  });
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
