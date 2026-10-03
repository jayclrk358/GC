'use client';

import * as React from 'react';

// "What's new" in the Windows app, shown in the app's own window. The app asks for it (once after
// each update, and from Help → What's new) by firing a `gc:whats-new` event on the page; this
// answers by cancelling the event, so the app knows it was shown. The dialog's code loads only then.
const WhatsNewDialog = React.lazy(() =>
  import('./whats-new-dialog').then((m) => ({ default: m.WhatsNewDialog })),
);

export function WhatsNew() {
  const [open, setOpen] = React.useState(false);
  const [asked, setAsked] = React.useState(false);
  React.useEffect(() => {
    const show = (e: Event) => {
      e.preventDefault();
      setAsked(true);
      setOpen(true);
    };
    window.addEventListener('gc:whats-new', show);
    return () => window.removeEventListener('gc:whats-new', show);
  }, []);
  if (!asked) return null;
  return (
    <React.Suspense fallback={null}>
      <WhatsNewDialog open={open} onOpenChange={setOpen} />
    </React.Suspense>
  );
}
