'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';

/** A secret shown once (an API token, a signing secret), with a copy button. */
export function SecretBox({
  title,
  message,
  value,
  onDone,
}: {
  title: string;
  message: string;
  value: string;
  onDone: () => void;
}) {
  const t = useTranslations('developer');
  const id = React.useId();
  return (
    <Alert tone="success" title={title} live>
      <p className="mt-1">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          id={id}
          className="min-w-0 flex-1 rounded-ui border border-border bg-surface px-3 py-2 font-mono text-sm break-all text-fg"
        >
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-describedby={id}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success(t('copied'));
            } catch {
              toast.error(t('copyFailed'));
            }
          }}
        >
          <Copy className="size-4" aria-hidden />
          {t('copy')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('done')}
        </Button>
      </div>
    </Alert>
  );
}
