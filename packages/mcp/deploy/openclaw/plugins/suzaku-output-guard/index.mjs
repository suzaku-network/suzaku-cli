import { guardOutboundText } from './transform.mjs';

// Export the plugin object directly. Image-seeded extensions are loaded from the
// persistent OpenClaw state directory, where the `openclaw` package is not a
// resolvable Node dependency. `definePluginEntry` is only a typing helper and
// importing it here prevents the production loader from importing this plugin.
export default {
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
};
