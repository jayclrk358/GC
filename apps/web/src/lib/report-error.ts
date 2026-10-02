'use client';

/** Tell the server a page broke in this browser (for error reporting); never throws. */
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const body = JSON.stringify({
      message: String(error.message).slice(0, 500),
      stack: error.stack?.slice(0, 4000),
      digest: error.digest,
      path: window.location.pathname.slice(0, 300),
    });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/client-errors', blob)) {
      void fetch('/api/client-errors', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting is best-effort.
  }
}
