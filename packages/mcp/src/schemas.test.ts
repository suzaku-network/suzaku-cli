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

describe('RpcUrl schema', () => {
  it('accepts valid RPC URLs', () => {
    expect(RpcUrl.parse('https://api.avax.network/ext/bc/C/rpc')).toBeTruthy();
    expect(RpcUrl.parse('http://localhost:8545')).toBeTruthy();
    expect(RpcUrl.parse('wss://ws.example.com')).toBeTruthy();
    expect(RpcUrl.parse('ws://localhost:8546')).toBeTruthy();
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
});
