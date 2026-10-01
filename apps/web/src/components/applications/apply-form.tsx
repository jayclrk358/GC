'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ApplicationForm } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { submitApplicationAction, withdrawApplicationAction } from '@/app/actions/applications';

/** The community's questions, to apply to join. */
export function ApplyForm({ communityId, form }: { communityId: string; form: ApplicationForm }) {
  const t = useTranslations('applications');
  const router = useRouter();
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await submitApplicationAction(communityId, answers);
    setPending(false);
    if (r.ok) {
      toast.success(t('sent'));
      router.refresh();
    } else {
      setError(r.error);
      setFields(r.fields ?? {});
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <FormError message={error} />
      {form.questions.map((q) => {
        const value = answers[q.id];
        if (q.kind === 'choice' || q.kind === 'checkboxes') {
          const multiple = q.kind === 'checkboxes';
          const picked = Array.isArray(value) ? value : value ? [value] : [];
          return (
            <fieldset
              key={q.id}
              className="flex flex-col gap-2"
              aria-describedby={fields[q.id] ? `${q.id}-err` : undefined}
            >
              <legend className="mb-1 text-sm font-semibold">
                {q.label}
                {q.required && (
                  <span className="text-danger" aria-hidden>
                    {' '}
                    *
                  </span>
                )}
                {q.required && <span className="sr-only"> ({t('required')})</span>}
              </legend>
              {q.options.map((o) => (
                <label key={o} className="flex items-center gap-2">
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={q.id}
                    className="size-4 accent-[var(--c-primary)]"
                    checked={picked.includes(o)}
                    onChange={(e) =>
                      set(
                        q.id,
                        multiple
                          ? e.target.checked
                            ? [...picked, o]
                            : picked.filter((x) => x !== o)
                          : o,
                      )
                    }
                  />
                  {o}
                </label>
              ))}
              {fields[q.id] && (
                <p id={`${q.id}-err`} className="text-sm font-medium text-danger">
                  {fields[q.id]}
                </p>
              )}
            </fieldset>
          );
        }
        return (
          <Field key={q.id} label={q.label} required={q.required} error={fields[q.id]}>
            {(p) =>
              q.kind === 'long' ? (
                <Textarea
                  {...p}
                  rows={5}
                  maxLength={4000}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              ) : (
                <Input
                  {...p}
                  maxLength={300}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              )
            }
          </Field>
        );
      })}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {t('send')}
        </Button>
      </div>
    </form>
  );
}

/** Take back an application that hasn't been answered yet. */
export function WithdrawButton({ communityId }: { communityId: string }) {
  const t = useTranslations('applications');
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const r = await withdrawApplicationAction(communityId);
        setPending(false);
        if (r.ok) {
          toast.success(t('withdrawn'));
          router.refresh();
        } else toast.error(r.error);
      }}
    >
      {t('withdraw')}
    </Button>
  );
}
