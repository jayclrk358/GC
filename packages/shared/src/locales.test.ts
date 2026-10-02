import { describe, expect, it } from 'vitest';
import { matchLocale } from './locales';

describe('matchLocale', () => {
  it('follows the browser’s order of preference', () => {
    expect(matchLocale('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(matchLocale('en-GB,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(matchLocale('fr;q=0.5,es;q=0.9')).toBe('es');
  });

  it('matches regional variants to the language', () => {
    expect(matchLocale('pt-PT,pt;q=0.9')).toBe('pt-BR');
    expect(matchLocale('es-MX')).toBe('es');
    expect(matchLocale('fr-CA')).toBe('fr');
    expect(matchLocale('PT-br')).toBe('pt-BR');
  });

  it('falls back to English', () => {
    expect(matchLocale(null)).toBe('en');
    expect(matchLocale('')).toBe('en');
    expect(matchLocale('ja,zh;q=0.8')).toBe('en');
    expect(matchLocale('de;q=0')).toBe('en');
    expect(matchLocale('*')).toBe('en');
  });
});
