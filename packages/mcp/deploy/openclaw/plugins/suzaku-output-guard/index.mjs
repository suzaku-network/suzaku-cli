import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { guardOutboundText } from './transform.mjs';

export default definePluginEntry({
  id: 'suzaku-output-guard',
  name: 'Suzaku Output Guard',
  description: 'Guards and normalizes bot messages immediately before channel delivery.',
  register(api) {
    api.on(
      'message_sending',
      async (event) => {
        const guarded = guardOutboundText(event.content);
        if (!guarded.changed) return;
        api.logger.info?.(
          `suzaku-output-guard: transformed outbound message ` +
          `(redactions=${guarded.redactions}, markdown=${guarded.markdownConversions})`,
        );
        return { content: guarded.content };
      },
      { priority: 100, timeoutMs: 1_000 },
    );
  },
});
