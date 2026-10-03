import { describe, expect, it } from 'vitest';
import { audibleLength, CUES, cueLength, levelSound } from './sound-design';

const RATE = 8000;

function tone(seconds: number, amplitude: number): Float32Array {
  const data = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < data.length; i++)
    data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return data;
}

describe('levelSound', () => {
  it('brings quiet and loud sounds to the same loudness', () => {
    const quiet = [tone(0.3, 0.05), tone(0.3, 0.05)];
    const loud = [tone(0.3, 0.8), tone(0.3, 0.8)];
    levelSound(quiet, RATE, 1);
    levelSound(loud, RATE, 1);
    const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
    expect(rms(quiet[0]!)).toBeCloseTo(0.2, 2);
    expect(rms(loud[0]!)).toBeCloseTo(0.2, 2);
  });

  it('never lets the peak go over the limit, and applies the cue level', () => {
    // A single spike: its loudness alone would ask for a huge gain.
    const spike = new Float32Array(RATE);
    spike[100] = 0.01;
    levelSound([spike], RATE, 0.5);
    expect(Math.max(...spike.map(Math.abs))).toBeCloseTo(0.45, 5);
  });

  it('leaves silence alone', () => {
    const silence = new Float32Array(100);
    expect(levelSound([silence], RATE, 1)).toBe(0);
  });
});

describe('audibleLength', () => {
  it('cuts the inaudible tail, fading the end', () => {
    const data = new Float32Array(RATE);
    data.fill(0.5, 0, RATE / 4);
    data.fill(0.0001, RATE / 4);
    const keep = audibleLength([data], RATE);
    expect(keep).toBeGreaterThan(RATE / 4 - 1);
    expect(keep).toBeLessThan(RATE / 4 + RATE * 0.01);
    expect(Math.abs(data[keep - 1] ?? 1)).toBeLessThan(0.5);
  });
});

describe('cues', () => {
  it('are short', () => {
    for (const cue of Object.keys(CUES) as (keyof typeof CUES)[]) {
      for (const pack of ['gamecentral', 'soft', 'arcade', 'crystal'] as const) {
        expect(cueLength(cue, pack)).toBeLessThanOrEqual(2.6);
      }
    }
  });
});
