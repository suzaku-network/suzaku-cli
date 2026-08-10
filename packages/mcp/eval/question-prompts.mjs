function assertPrompt(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

/** Canonical prompt followed by its intent-equivalent paraphrases. */
export function questionPrompts(question) {
  const canonical = assertPrompt(question?.prompt, `${question?.id ?? 'question'}.prompt`);
  const variants = question?.promptVariants ?? [];
  if (!Array.isArray(variants)) {
    throw new TypeError(`${question?.id ?? 'question'}.promptVariants must be an array`);
  }
  const prompts = [
    canonical,
    ...variants.map((prompt, index) => assertPrompt(
      prompt,
      `${question?.id ?? 'question'}.promptVariants.${index}`,
    )),
  ];
  if (new Set(prompts).size !== prompts.length) {
    throw new TypeError(`${question?.id ?? 'question'} contains duplicate prompts`);
  }
  return prompts;
}

/**
 * Select a reproducible wording for a repeated eval. Repeat 1 is always the
 * canonical production question; later repeats walk the configured paraphrases.
 */
export function selectQuestionPrompt(question, repeat = 1) {
  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new TypeError('repeat must be a positive integer');
  }
  const prompts = questionPrompts(question);
  const index = (repeat - 1) % prompts.length;
  return {
    template: prompts[index],
    index,
    count: prompts.length,
  };
}
