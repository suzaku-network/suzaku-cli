import { describe, expect, it, vi } from 'vitest';

import plugin from '../deploy/openclaw/plugins/suzaku-output-guard/index.mjs';

describe('suzaku-output-guard plugin registration', () => {
  const registerAndCapture = () => {
    const registered = [];
    const api = {
      on: (event, handler, options) => registered.push({ event, handler, options }),
      logger: { info: vi.fn() },
    };
    plugin.register(api);
    return registered;
  };

  it('registers exactly one message_sending handler', () => {
    const registered = registerAndCapture();
    expect(registered).toHaveLength(1);
    expect(registered[0].event).toBe('message_sending');
    expect(registered[0].options).toMatchObject({ timeoutMs: 1_000 });
  });

  it('returns replacement content when the guard changes the text', async () => {
    const [{ handler }] = registerAndCapture();
    await expect(handler({ content: 'Use **bold** now' })).resolves.toEqual({
      content: 'Use <b>bold</b> now',
    });
  });

  it('returns undefined when the text is already clean', async () => {
    const [{ handler }] = registerAndCapture();
    await expect(handler({ content: 'plain text' })).resolves.toBeUndefined();
  });
});
