import { z } from 'zod';

/** Ethereum address — 0x-prefixed, 20 bytes */
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Ethereum address (0x-prefixed, 20 bytes)');

/** Hex-encoded byte string */
export const Hex = z.string().regex(/^0x[0-9a-fA-F]+$/).describe('Hex string');

/** Avalanche NodeID in CB58 format */
export const NodeID = z.string().regex(/^NodeID-[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/).describe('NodeID in CB58 format (e.g. NodeID-xxx)');

/** Target network */
export const Network = z.enum(['mainnet', 'fuji', 'anvil', 'kiteaitestnet', 'kiteai', 'custom']).default('mainnet').describe('Network to use');

/**
 * Check whether a hostname resolves to a private/loopback/link-local address.
 * Used to block SSRF via user-supplied RPC URLs.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Loopback
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.startsWith('127.')) return true;

  // IPv6 loopback compressed forms
  if (h === '[::1]') return true;

  // 0.0.0.0
  if (h === '0.0.0.0') return true;

  // RFC 1918 private ranges
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;

  // Link-local (169.254.x.x — AWS metadata, etc.)
  if (h.startsWith('169.254.')) return true;

  // IPv6 ULA (fc00::/7) and link-local (fe80::/10)
  const bare = h.replace(/^\[/, '').replace(/\]$/, '');
  if (/^f[cd]/i.test(bare)) return true;
  if (/^fe[89ab]/i.test(bare)) return true;

  // All-zero IPv6 (binds to all interfaces)
  if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1) — extract embedded IPv4 and recurse
  const mappedMatch = bare.match(/^::ffff:(.+)$/);
  if (mappedMatch) {
    const embedded = mappedMatch[1];
    // Dotted-decimal form: ::ffff:10.0.0.1
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(embedded)) {
      return isPrivateHost(embedded);
    }
    // Hex-pair form: ::ffff:7f00:1 → convert two 16-bit groups to IPv4
    const hexParts = embedded.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateHost(ipv4);
      }
    }
  }

  // Metadata IP used by cloud providers
  if (h === '169.254.169.254') return true;

  return false;
}

/** Optional RPC URL — when set, overrides the network default and the network parameter is ignored */
export const RpcUrl = z.string()
  .regex(/^(https?|wss?):\/\/.+/)
  .refine((url) => {
    try {
      const hostname = new URL(url).hostname;
      return !isPrivateHost(hostname);
    } catch {
      return false;
    }
  }, { message: 'RPC URL must not point to private, loopback, or link-local addresses' })
  .optional()
  .describe('Custom RPC URL (overrides network default — when set, the network parameter is ignored)');
