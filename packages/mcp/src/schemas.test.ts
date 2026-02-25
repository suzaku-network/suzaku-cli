import { describe, it, expect } from 'vitest';
import { Address, Hex, NodeID, Network, RpcUrl, isPrivateHost } from './schemas.js';

describe('Address schema', () => {
  it('accepts valid Ethereum addresses', () => {
    expect(Address.parse('0x' + 'a'.repeat(40))).toBe('0x' + 'a'.repeat(40));
    expect(Address.parse('0x' + 'A'.repeat(40))).toBe('0x' + 'A'.repeat(40));
    expect(Address.parse('0x1234567890abcdef1234567890abcdef12345678')).toBeTruthy();
  });

  it('rejects addresses without 0x prefix', () => {
    expect(() => Address.parse('a'.repeat(40))).toThrow();
  });

  it('rejects addresses with wrong length', () => {
    expect(() => Address.parse('0x' + 'a'.repeat(39))).toThrow();
    expect(() => Address.parse('0x' + 'a'.repeat(41))).toThrow();
  });

  it('rejects addresses with non-hex characters', () => {
    expect(() => Address.parse('0x' + 'g'.repeat(40))).toThrow();
  });
});

describe('Hex schema', () => {
  it('accepts valid hex strings', () => {
    expect(Hex.parse('0xdeadbeef')).toBe('0xdeadbeef');
    expect(Hex.parse('0x1')).toBe('0x1');
  });

  it('rejects hex without 0x prefix', () => {
    expect(() => Hex.parse('deadbeef')).toThrow();
  });

  it('rejects empty 0x', () => {
    expect(() => Hex.parse('0x')).toThrow();
  });
});

describe('NodeID schema', () => {
  it('accepts valid NodeID strings in CB58 format', () => {
    expect(NodeID.parse('NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5')).toBeTruthy();
  });

  it('rejects strings without NodeID- prefix', () => {
    expect(() => NodeID.parse('some-node-id')).toThrow();
    expect(() => NodeID.parse('P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5')).toThrow();
  });

  it('rejects NodeID with invalid CB58 characters (0, O, I, l)', () => {
    expect(() => NodeID.parse('NodeID-000000')).toThrow();
    expect(() => NodeID.parse('NodeID-OOOIII')).toThrow();
    expect(() => NodeID.parse('NodeID-lllll')).toThrow();
  });
});

describe('Network schema', () => {
  it('accepts valid network names', () => {
    expect(Network.parse('mainnet')).toBe('mainnet');
    expect(Network.parse('fuji')).toBe('fuji');
    expect(Network.parse('anvil')).toBe('anvil');
    expect(Network.parse('kitetestnet')).toBe('kitetestnet');
  });

  it('defaults to mainnet when undefined', () => {
    expect(Network.parse(undefined)).toBe('mainnet');
  });

  it('accepts custom network', () => {
    expect(Network.parse('custom')).toBe('custom');
  });

  it('rejects invalid network names', () => {
    expect(() => Network.parse('invalid')).toThrow();
    expect(() => Network.parse('testnet')).toThrow();
  });
});

describe('isPrivateHost', () => {
  it('blocks localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('LOCALHOST')).toBe(true);
  });

  it('blocks 127.x.x.x loopback', () => {
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('127.0.0.2')).toBe(true);
    expect(isPrivateHost('127.255.255.255')).toBe(true);
  });

  it('blocks 0.0.0.0', () => {
    expect(isPrivateHost('0.0.0.0')).toBe(true);
  });

  it('blocks RFC 1918 10.x', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('10.255.255.255')).toBe(true);
  });

  it('blocks RFC 1918 172.16-31.x', () => {
    expect(isPrivateHost('172.16.0.1')).toBe(true);
    expect(isPrivateHost('172.31.255.255')).toBe(true);
  });

  it('allows 172.32.x (not RFC 1918)', () => {
    expect(isPrivateHost('172.32.0.1')).toBe(false);
  });

  it('blocks RFC 1918 192.168.x', () => {
    expect(isPrivateHost('192.168.0.1')).toBe(true);
    expect(isPrivateHost('192.168.1.1')).toBe(true);
  });

  it('blocks link-local 169.254.x.x (AWS metadata)', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('169.254.0.1')).toBe(true);
  });

  it('blocks IPv6 loopback', () => {
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('[::1]')).toBe(true);
  });

  it('blocks IPv6 ULA (fc/fd)', () => {
    expect(isPrivateHost('fc00::1')).toBe(true);
    expect(isPrivateHost('fd12:3456::1')).toBe(true);
  });

  it('blocks IPv6 link-local (fe80)', () => {
    expect(isPrivateHost('fe80::1')).toBe(true);
  });

  it('blocks all-zero IPv6 (::)', () => {
    expect(isPrivateHost('::')).toBe(true);
    expect(isPrivateHost('[::]')).toBe(true);
    expect(isPrivateHost('0:0:0:0:0:0:0:0')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateHost('[::ffff:127.0.0.1]')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 private ranges', () => {
    expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateHost('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateHost('::ffff:172.16.0.1')).toBe(true);
    expect(isPrivateHost('[::ffff:10.0.0.1]')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 hex-pair form (::ffff:7f00:1)', () => {
    // ::ffff:7f00:1 → 127.0.0.1
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true);
    expect(isPrivateHost('[::ffff:7f00:1]')).toBe(true);
    // ::ffff:a00:1 → 10.0.0.1
    expect(isPrivateHost('::ffff:a00:1')).toBe(true);
    // ::ffff:c0a8:101 → 192.168.1.1
    expect(isPrivateHost('::ffff:c0a8:101')).toBe(true);
  });

  it('allows IPv4-mapped IPv6 with public IPs', () => {
    // ::ffff:8.8.8.8
    expect(isPrivateHost('::ffff:8.8.8.8')).toBe(false);
    // ::ffff:0808:0808 → 8.8.8.8
    expect(isPrivateHost('::ffff:808:808')).toBe(false);
  });

  it('allows public IPs', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('1.1.1.1')).toBe(false);
    expect(isPrivateHost('api.avax.network')).toBe(false);
  });
});

describe('RpcUrl schema', () => {
  it('accepts valid public RPC URLs', () => {
    expect(RpcUrl.parse('https://api.avax.network/ext/bc/C/rpc')).toBeTruthy();
    expect(RpcUrl.parse('wss://ws.example.com')).toBeTruthy();
    expect(RpcUrl.parse('https://rpc-testnet.gokite.ai/')).toBeTruthy();
  });

  it('accepts undefined (optional)', () => {
    expect(RpcUrl.parse(undefined)).toBeUndefined();
  });

  it('rejects URLs without protocol', () => {
    expect(() => RpcUrl.parse('localhost:8545')).toThrow();
    expect(() => RpcUrl.parse('api.avax.network/ext/bc/C/rpc')).toThrow();
  });

  it('rejects non-URL strings', () => {
    expect(() => RpcUrl.parse('not-a-url')).toThrow();
  });

  it('rejects localhost URLs (SSRF)', () => {
    expect(() => RpcUrl.parse('http://localhost:8545')).toThrow();
    expect(() => RpcUrl.parse('http://127.0.0.1:8545')).toThrow();
    expect(() => RpcUrl.parse('ws://localhost:8546')).toThrow();
  });

  it('rejects cloud metadata endpoint (SSRF)', () => {
    expect(() => RpcUrl.parse('http://169.254.169.254/')).toThrow();
    expect(() => RpcUrl.parse('http://169.254.169.254/latest/meta-data/')).toThrow();
  });

  it('rejects RFC 1918 private IPs (SSRF)', () => {
    expect(() => RpcUrl.parse('http://10.0.0.1/')).toThrow();
    expect(() => RpcUrl.parse('http://192.168.1.1/')).toThrow();
    expect(() => RpcUrl.parse('http://172.16.0.1/')).toThrow();
  });

  it('rejects 0.0.0.0 (SSRF)', () => {
    expect(() => RpcUrl.parse('http://0.0.0.0:8545')).toThrow();
  });

  it('rejects IPv4-mapped IPv6 SSRF bypass (::ffff:7f00:1)', () => {
    expect(() => RpcUrl.parse('http://[::ffff:7f00:1]:8545')).toThrow();
    expect(() => RpcUrl.parse('http://[::ffff:127.0.0.1]:8545')).toThrow();
    expect(() => RpcUrl.parse('http://[::ffff:10.0.0.1]:8545')).toThrow();
  });

  it('rejects all-zero IPv6 ([::])', () => {
    expect(() => RpcUrl.parse('http://[::]:8545')).toThrow();
  });
});
