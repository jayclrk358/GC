'use client';

import * as React from 'react';

/** Hidden text that reveals on click or keyboard activation. */
export function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false);
  if (revealed) {
    return (
      <span className="spoiler" data-revealed="true">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="spoiler inline px-1"
      onClick={() => setRevealed(true)}
      aria-label="Spoiler, activate to reveal"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
