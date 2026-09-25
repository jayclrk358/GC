/** Keyboard shortcut registry. Combos: "mod+k", "?", "/", or two-key sequences like "g h". */
export interface ShortcutDef {
  id: string;
  keys: string;
  labelKey: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'palette', keys: 'mod+k', labelKey: 'palette' },
  { id: 'help', keys: '?', labelKey: 'help' },
  { id: 'search', keys: '/', labelKey: 'search' },
  { id: 'go-home', keys: 'g h', labelKey: 'goHome' },
  { id: 'go-explore', keys: 'g e', labelKey: 'goExplore' },
  { id: 'go-servers', keys: 'g s', labelKey: 'goServers' },
  { id: 'go-notifications', keys: 'g n', labelKey: 'goNotifications' },
  { id: 'go-settings', keys: 'g a', labelKey: 'goSettings' },
];

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** A combo is "single key" (WCAG 2.1.4) when it has no Ctrl/Alt/Meta modifier. */
export function isSingleKey(combo: string): boolean {
  return !/(^|\+)(mod|ctrl|alt|meta)\+/.test(combo);
}

export function eventToCombo(e: KeyboardEvent): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (mod) parts.push('mod');
  if (e.altKey) parts.push('alt');
  let key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (key === ' ') key = 'space';
  // Shift is implied by printable characters like "?".
  if (e.shiftKey && e.key.length > 1) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

export function formatCombo(combo: string): string[] {
  return combo.split(' ').map((step) =>
    step
      .split('+')
      .map((p) =>
        p === 'mod'
          ? isMac()
            ? '⌘'
            : 'Ctrl'
          : p === 'alt'
            ? isMac()
              ? '⌥'
              : 'Alt'
            : p.length === 1
              ? p.toUpperCase()
              : p,
      )
      .join(' + '),
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
  }
  return false;
}
