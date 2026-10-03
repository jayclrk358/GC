import { useTranslations } from 'next-intl';
import type { FeedbackKind, FeedbackStatus } from '@gamecentral/shared';
import { Badge } from '@/components/ui/misc';

const STATUS_TONE = {
  new: 'primary',
  planned: 'accent',
  in_progress: 'warning',
  done: 'success',
  declined: 'neutral',
} as const;

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const t = useTranslations('feedback');
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function FeedbackKindBadge({ kind }: { kind: FeedbackKind }) {
  const t = useTranslations('feedback');
  return <Badge>{t(`kinds.${kind}.short`)}</Badge>;
}

/** One message in a feedback conversation. */
export function FeedbackMessage({
  author,
  internal,
  fromStaff,
  date,
  children,
}: {
  author: string;
  internal?: boolean;
  fromStaff?: boolean;
  date: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations('feedback');
  return (
    <li
      className={
        internal
          ? 'rounded-ui border border-dashed border-warning/60 bg-warning/5 p-4'
          : fromStaff
            ? 'rounded-ui border border-primary/40 bg-primary/5 p-4'
            : 'rounded-ui border border-border bg-surface p-4'
      }
    >
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">{author}</span>
        {internal && (
          <span className="text-xs font-semibold text-warning">{t('internalNote')}</span>
        )}
        <span className="text-xs text-muted">{date}</span>
      </p>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </li>
  );
}
