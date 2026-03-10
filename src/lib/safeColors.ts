/**
 * Browser-safe color utilities.
 * In Node.js terminal environments, use ANSI colors from console-log-colors.
 * In browser environments, return strings as-is (no-op).
 */

const isBrowser = typeof window !== 'undefined';

function colorFn(str: string) {
  return str;
}

// Lazily load console-log-colors only on Node.js
let _color: Record<string, (s: string) => string> | null = null;

async function getColor(): Promise<typeof _color> {
  if (_color) return _color;
  if (isBrowser) {
    _color = {};
    return _color;
  }
  const mod = await import('console-log-colors');
  _color = mod.color as any;
  return _color;
}

// Synchronous proxy object — returns the string unchanged in browser,
// or applies ANSI codes when running in Node.js (terminal).
// Since the terminal colors are loaded asynchronously, we provide
// a synchronous fallback that is always safe for browsers.
export const color: Record<string, (s: string) => string> = new Proxy({} as any, {
  get(_target, prop: string) {
    if (isBrowser) {
      // In browser context, return a no-op function
      return colorFn;
    }
    // In terminal context, use the real module synchronously
    // (it's a CJS module so require would work in node, but since tsup
    // bundles it inline, we rely on the bundled version)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const colorsModule = require('console-log-colors');
      const fn = colorsModule?.color?.[prop];
      if (typeof fn === 'function') return fn;
    } catch {
      // fallback
    }
    return colorFn;
  },
});
