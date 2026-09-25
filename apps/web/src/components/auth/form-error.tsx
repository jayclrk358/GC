'use client';

import * as React from 'react';
import { Alert } from '@/components/ui/misc';

/** Form-level error: announced to screen readers and focused so it is not missed. */
export function FormError({ message }: { message: string | null }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <Alert tone="danger" live>
        {message}
      </Alert>
    </div>
  );
}
