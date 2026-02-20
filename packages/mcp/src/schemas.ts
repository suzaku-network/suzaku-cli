import { z } from 'zod';

/** Ethereum address — 0x-prefixed, 20 bytes */
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Ethereum address (0x-prefixed, 20 bytes)');

/** Hex-encoded byte string */
export const Hex = z.string().regex(/^0x[0-9a-fA-F]+$/).describe('Hex string');

/** Avalanche NodeID in CB58 format */
export const NodeID = z.string().describe('NodeID in CB58 format (e.g. NodeID-xxx)');

/** Target network */
export const Network = z.enum(['mainnet', 'fuji', 'anvil', 'kitetestnet']).default('mainnet').describe('Network to use');

/** Optional RPC URL — when set, overrides the network default and the network parameter is ignored */
export const RpcUrl = z.string().optional().describe('Custom RPC URL (overrides network default — when set, the network parameter is ignored)');
