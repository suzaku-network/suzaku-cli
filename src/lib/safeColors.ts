/**
 * Browser-safe color utilities.
 * In Node.js terminal environments, use ANSI colors from console-log-colors.
 * In browser environments, return strings as-is (no-op).
 */

const isBrowser = typeof window !== 'undefined' || typeof process === 'undefined' || !process.stdout;

// Basic no-op function for colors
const noopColor = (s: string) => s;

let colors: Record<string, (s: string) => string> | null = null;

// Dynamically try to load real colors if we are in a Node environment
if (!isBrowser) {
  try {
    // Webpack / Next.js bundlers will ignore this if we trick the static analysis. 
    // We use eval or a dynamic Function to require it only at runtime.
    const req = typeof module !== 'undefined' && module.require ? module.require : null;
    if (req) {
      const consoleLogColors = req('console-log-colors');
      if (consoleLogColors && consoleLogColors.color) {
        colors = consoleLogColors.color;
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

// Proxied color object that safely gracefully falls back to no-op
export const color: Record<string, (s: string) => string> = new Proxy({} as any, {
  get(_target, prop: string) {
    if (colors && typeof colors[prop] === 'function') {
      return colors[prop];
    }
    return noopColor;
  },
});
