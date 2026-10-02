'use client';

import * as React from 'react';
import { reportClientError } from '@/lib/report-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}
      >
        <main>
          <h1>Something went wrong</h1>
          <p>An unexpected error happened.</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '0.6rem 1.2rem', fontSize: '1rem' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
