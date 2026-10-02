import { describe, expect, it } from 'vitest';
import { clampName, MAX_NAME_LENGTH, userInputProblem } from './user-input';

describe('userInputProblem', () => {
  const long = 'x'.repeat(MAX_NAME_LENGTH + 1);

  it('caps names on sign-up and on update', () => {
    expect(userInputProblem('/sign-up/email', { name: long, email: 'a@b.c' })).toMatch(/at most/);
    expect(userInputProblem('/update-user', { name: long })).toMatch(/at most/);
    expect(userInputProblem('/sign-up/email', { name: 'x'.repeat(MAX_NAME_LENGTH) })).toBeNull();
    // Surrounding spaces don't count; characters do, not UTF-16 units.
    expect(userInputProblem('/update-user', { name: ` ${'x'.repeat(MAX_NAME_LENGTH)} ` })).toBe(
      null,
    );
    expect(userInputProblem('/update-user', { name: '😀'.repeat(MAX_NAME_LENGTH) })).toBeNull();
  });

  it('refuses avatar changes through Better Auth', () => {
    expect(userInputProblem('/update-user', { image: 'https://evil.example/x.png' })).toMatch(
      /avatar/,
    );
    expect(userInputProblem('/update-user', { image: null, name: 'Ann' })).toMatch(/avatar/);
    expect(userInputProblem('/update-user', { name: 'Ann' })).toBeNull();
    expect(userInputProblem('/update-user', { username: 'ann' })).toBeNull();
  });

  it('leaves other endpoints and odd bodies alone', () => {
    expect(userInputProblem('/sign-in/email', { name: long })).toBeNull();
    expect(userInputProblem('/update-user', undefined)).toBeNull();
    expect(userInputProblem('/update-user', 'text')).toBeNull();
  });
});

describe('clampName', () => {
  it('trims and cuts long names without splitting characters', () => {
    expect(clampName('  Ann  ')).toBe('Ann');
    expect(clampName('x'.repeat(100))).toHaveLength(MAX_NAME_LENGTH);
    const emoji = clampName('😀'.repeat(100));
    expect([...emoji]).toHaveLength(MAX_NAME_LENGTH);
    expect(emoji).toBe('😀'.repeat(MAX_NAME_LENGTH));
  });
});
