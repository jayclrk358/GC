import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  applicationFormSchema,
  parseApplicationAnswers,
  type ApplicationForm,
} from './applications';

const form: ApplicationForm = applicationFormSchema.parse({
  intro: 'Tell us about yourself.',
  questions: [
    { id: 'ign000', label: 'In-game name', kind: 'short' },
    { id: 'region', label: 'Region', kind: 'choice', options: ['EU', 'NA'] },
    {
      id: 'roles00',
      label: 'Roles you play',
      kind: 'checkboxes',
      options: ['Tank', 'Healer', 'DPS'],
    },
    { id: 'extra0', label: 'Anything else?', kind: 'long', required: false },
  ],
});

describe('parseApplicationAnswers', () => {
  it('keeps answers in the form order with the question wording', () => {
    const answers = parseApplicationAnswers(form, {
      roles00: ['Healer', 'Tank', 'Healer', 'Bard'],
      ign000: '  Steve  ',
      region: 'EU',
    });
    expect(answers).toEqual([
      { questionId: 'ign000', label: 'In-game name', value: 'Steve' },
      { questionId: 'region', label: 'Region', value: 'EU' },
      { questionId: 'roles00', label: 'Roles you play', value: ['Healer', 'Tank'] },
      { questionId: 'extra0', label: 'Anything else?', value: '' },
    ]);
  });

  it('names each question that has a problem', () => {
    try {
      parseApplicationAnswers(form, { region: 'Moon', roles00: [] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      const paths = (e as ZodError).issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(['ign000', 'region', 'roles00']);
    }
  });

  it('needs options for choice questions', () => {
    expect(
      applicationFormSchema.safeParse({
        questions: [{ id: 'pick00', label: 'Pick', kind: 'choice', options: ['Only one'] }],
      }).success,
    ).toBe(false);
  });
});
