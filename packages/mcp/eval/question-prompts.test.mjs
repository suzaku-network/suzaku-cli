import { describe, expect, it } from 'vitest';
import { questionPrompts, selectQuestionPrompt } from './question-prompts.mjs';

describe('eval prompt variants', () => {
  const question = {
    id: 'rewards-intent',
    prompt: 'Canonical wording',
    promptVariants: ['Natural paraphrase', 'Short operator wording'],
  };

  it('runs the canonical wording first and paraphrases on later repeats', () => {
    expect(selectQuestionPrompt(question, 1)).toMatchObject({
      template: 'Canonical wording', index: 0, count: 3,
    });
    expect(selectQuestionPrompt(question, 2).template).toBe('Natural paraphrase');
    expect(selectQuestionPrompt(question, 3).template).toBe('Short operator wording');
    expect(selectQuestionPrompt(question, 4).template).toBe('Canonical wording');
  });

  it('keeps questions without variants backward compatible', () => {
    expect(questionPrompts({ id: 'old', prompt: 'Existing question' }))
      .toEqual(['Existing question']);
    expect(selectQuestionPrompt({ id: 'old', prompt: 'Existing question' }, 9).index)
      .toBe(0);
  });

  it('rejects empty, duplicate, and malformed prompt families', () => {
    expect(() => questionPrompts({ id: 'empty', prompt: '' })).toThrow('non-empty');
    expect(() => questionPrompts({ id: 'shape', prompt: 'ok', promptVariants: 'bad' }))
      .toThrow('must be an array');
    expect(() => questionPrompts({ id: 'dupe', prompt: 'same', promptVariants: ['same'] }))
      .toThrow('duplicate prompts');
    expect(() => selectQuestionPrompt(question, 0)).toThrow('positive integer');
  });
});
