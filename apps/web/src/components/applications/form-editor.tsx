'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ApplicationForm } from '@magnox/shared';
import {
  MAX_APPLICATION_QUESTIONS,
  QUESTION_KINDS,
  type QuestionKind,
} from '@magnox/shared/applications-values';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { saveApplicationFormAction } from '@/app/actions/applications';

interface Draft {
  id: string;
  label: string;
  kind: QuestionKind;
  required: boolean;
  /** One option per line, as typed. */
  options: string;
}

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** The questions people answer when applying to join. */
export function ApplicationFormEditor({
  communityId,
  initial,
}: {
  communityId: string;
  initial: ApplicationForm;
}) {
  const t = useTranslations('applications.form');
  const router = useRouter();
  const [intro, setIntro] = React.useState(initial.intro);
  const [questions, setQuestions] = React.useState<Draft[]>(() =>
    initial.questions.map((q) => ({ ...q, options: q.options.join('\n') })),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('');

  const update = (i: number, change: Partial<Draft>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...change } : q)));
  const move = (i: number, by: number) =>
    setQuestions((qs) => {
      const next = [...qs];
      const [q] = next.splice(i, 1);
      next.splice(i + by, 0, q!);
      return next;
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await saveApplicationFormAction(communityId, {
      intro,
      questions: questions.map((q) => ({
        id: q.id,
        label: q.label,
        kind: q.kind,
        required: q.required,
        options:
          q.kind === 'choice' || q.kind === 'checkboxes'
            ? q.options
                .split('\n')
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
      })),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(t('saved'));
      setFields({});
      router.refresh();
    } else {
      setError(r.error);
      setFields(r.fields ?? {});
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      <FormError message={error} />
      <SettingsSection id="intro" title={t('introTitle')} description={t('introHint')}>
        <Field label={t('intro')} hideLabel>
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              maxLength={2000}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
            />
          )}
        </Field>
      </SettingsSection>

      <SettingsSection id="questions" title={t('questionsTitle')}>
        <ol className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <fieldset className="flex flex-col gap-3 rounded-ui border border-border p-4">
                <legend className="px-1 text-sm font-bold">{t('questionN', { n: i + 1 })}</legend>
                <Field label={t('question')} error={fields[`questions.${i}.label`]} required>
                  {(p) => (
                    <Input
                      {...p}
                      maxLength={200}
                      value={q.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                  )}
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('kind')}>
                    {(p) => (
                      <Select
                        {...p}
                        value={q.kind}
                        onValueChange={(v) => update(i, { kind: v as QuestionKind })}
                      >
                        {QUESTION_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`kinds.${k}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <SwitchField
                    label={t('required')}
                    checked={q.required}
                    onCheckedChange={(v) => update(i, { required: v })}
                  />
                </div>
                {(q.kind === 'choice' || q.kind === 'checkboxes') && (
                  <Field
                    label={t('options')}
                    description={t('optionsHint')}
                    error={fields[`questions.${i}.options`]}
                  >
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={4}
                        value={q.options}
                        onChange={(e) => update(i, { options: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => {
                      move(i, -1);
                      setStatus(t('movedUp', { n: i + 1 }));
                    }}
                    aria-label={t('moveUp', { n: i + 1 })}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={i === questions.length - 1}
                    onClick={() => {
                      move(i, 1);
                      setStatus(t('movedDown', { n: i + 1 }));
                    }}
                    aria-label={t('moveDown', { n: i + 1 })}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={questions.length === 1}
                    onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    className="text-danger"
                  >
                    <Trash2 aria-hidden /> {t('remove')}
                  </Button>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        <p role="status" className="sr-only">
          {status}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={questions.length >= MAX_APPLICATION_QUESTIONS}
          onClick={() =>
            setQuestions((qs) => [
              ...qs,
              { id: newId(), label: '', kind: 'short', required: true, options: '' },
            ])
          }
        >
          <Plus aria-hidden /> {t('add')}
        </Button>
      </SettingsSection>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
