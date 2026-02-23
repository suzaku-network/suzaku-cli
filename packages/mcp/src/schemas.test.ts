import { describe, it, expect } from 'vitest';
import { Address, Hex, NodeID, Network, RpcUrl } from './schemas.js';

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
  it('accepts NodeID strings', () => {
    expect(NodeID.parse('NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5')).toBeTruthy();
  });

  it('accepts any string (no strict validation regex)', () => {
    // NodeID schema uses z.string() with .describe(), no regex constraint
    expect(NodeID.parse('some-node-id')).toBe('some-node-id');
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

  it('rejects invalid network names', () => {
    expect(() => Network.parse('invalid')).toThrow();
    expect(() => Network.parse('testnet')).toThrow();
  });
});

describe('RpcUrl schema', () => {
  it('accepts valid RPC URLs', () => {
    expect(RpcUrl.parse('https://api.avax.network/ext/bc/C/rpc')).toBeTruthy();
    expect(RpcUrl.parse('http://localhost:8545')).toBeTruthy();
  });

  it('accepts undefined (optional)', () => {
    expect(RpcUrl.parse(undefined)).toBeUndefined();
  });
});
