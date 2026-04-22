import { utils } from '@avalabs/avalanchejs';
import { bytesToHex, hexToBytes as nobleHexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';
import { fromBytes, hexToBytes, Hex, pad, sliceHex, getAddress, slice } from 'viem';

export const pChainChainID = '11111111111111111111111111111111LpoYY';

const CHECKSUM_LENGTH = 4;

export function cb58ToBytes(cb58: string): Uint8Array {
    const decodedBytes = base58.decode(cb58);
    if (decodedBytes.length < CHECKSUM_LENGTH) {
        throw new Error('Input string is smaller than the checksum size');
    }
    return decodedBytes.slice(0, -CHECKSUM_LENGTH);
}

export function cb58ToHex(cb58: string): Hex;
export function cb58ToHex(cb58: string, include0x: true): Hex;
export function cb58ToHex(cb58: string, include0x: false): string;
export function cb58ToHex(cb58: string, include0x?: boolean): Hex | string {
    const rawBytes = cb58ToBytes(cb58);
    const hex = bytesToHex(rawBytes);
    const paddedHex = hex.padStart(64, '0');
    return (include0x === false ? '' : '0x') + paddedHex;
}

export function bytesToCB58(bytes: Uint8Array): string {
    const checksum = sha256(bytes).slice(0, 4);
    const withChecksum = new Uint8Array(bytes.length + 4);
    withChecksum.set(bytes);
    withChecksum.set(checksum, bytes.length);
    return base58.encode(withChecksum);
}

export type NodeId = `NodeID-${string}`;

export const parseNodeID = (nodeID: NodeId, padding = true): Hex => {
    const nodeIDWithoutPrefix = nodeID.replace('NodeID-', '');
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8);
    return padding ? pad(nodeIDHexTrimmed as Hex, { size: 32 }) as Hex : nodeIDHexTrimmed as Hex;
};

export const encodeNodeID = (nodeIDBytes: Hex): NodeId => {
    let nodeU8Array = hexToBytes(nodeIDBytes);
    nodeU8Array = nodeU8Array.length === 32 ? nodeU8Array.slice(12) : nodeU8Array;
    const nodeId = `NodeID-${utils.base58check.encode(nodeU8Array)}`;
    return nodeId as NodeId;
};

export function isValidPrivateKey(privateKeyHex: string): boolean {
    try {
        if (!privateKeyHex.match(/^[0-9a-fA-F]{64}$/)) return false;
        const privateKey = nobleHexToBytes(privateKeyHex);
        return privateKey.length === 32;
    } catch {
        return false;
    }
}

export function bytes32ToAddress(bytes32: `0x${string}`) {
    const raw = sliceHex(bytes32, 12, 32);
    return getAddress(raw);
}

interface FieldConfig {
    bytes: number | ((currentData: Hex) => number);
    type: (value: Hex) => any;
}

export function unpackGeneric<T extends Record<string, FieldConfig>>(
    data: Hex,
    config: T,
) {
    const decoded: any = {};
    let currentOffset = 0;

    for (const [fieldName, fieldConfig] of Object.entries(config)) {
        const remainingData = slice(data, currentOffset);
        const length = typeof fieldConfig.bytes === 'function'
            ? fieldConfig.bytes(remainingData)
            : fieldConfig.bytes;
        const rawValue = slice(data, currentOffset, currentOffset + length);
        decoded[fieldName] = fieldConfig.type(rawValue);
        currentOffset += length;
    }
    return {
        decoded: decoded as { [K in keyof T]: ReturnType<T[K]['type']> },
        remainder: currentOffset === data.length / 2 - 1 ? undefined : slice(data, currentOffset),
    };
}

export async function retryWhileError<T>(
    fetcher: () => Promise<T>,
    intervalMs: number,
    timeoutMs: number,
    accept: (result: T) => boolean = () => true,
): Promise<T> {
    const start = Date.now();
    let lastErr: unknown;

    while (true) {
        try {
            const result = await fetcher();
            if (accept(result)) return result;
            else throw new Error('retryWhileError: result not accepted');
        } catch (e) {
            lastErr = e;
            const elapsed = Date.now() - start;
            const remaining = timeoutMs - elapsed;
            if (remaining <= 0) break;
            await new Promise(res => setTimeout(res, Math.min(intervalMs, remaining)));
        }
    }

    throw lastErr ?? new Error('retryWhileError: timeout reached');
}
