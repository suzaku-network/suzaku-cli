import { utils, secp256k1 } from "@avalabs/avalanchejs";
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Address } from 'micro-eth-signer';
import { sha256 } from '@noble/hashes/sha256';
import { base58 } from '@scure/base';
import { Abi, fromBytes, Hex, pad, sliceHex, getAddress } from "viem";
import { logger } from './logger';
import { hexToUint8Array } from "./justification";
import { spawnSync } from "child_process";

export function bytes32ToAddress(bytes32: `0x${string}`) {
    // on garde les 20 derniers bytes (40 hex chars)
    const raw = sliceHex(bytes32, 12, 32); // bytes 12 → 32
    return getAddress(raw);
}


const CHECKSUM_LENGTH = 4;

function calculateChecksum(data: Uint8Array): Uint8Array {
    // In Avalanche, hashing.Checksum uses a single SHA256
    return sha256(data).slice(0, CHECKSUM_LENGTH);
}

export function cb58ToBytes(cb58: string): Uint8Array {
    const decodedBytes = base58.decode(cb58);
    if (decodedBytes.length < CHECKSUM_LENGTH) {
        throw new Error('Input string is smaller than the checksum size');
    }
    return decodedBytes.slice(0, -CHECKSUM_LENGTH);
}

export function cb58ToHex(cb58: string, include0x: boolean = true): string {
    const rawBytes = cb58ToBytes(cb58);
    const hex = bytesToHex(rawBytes);

    // Pad to 32 bytes (64 characters) - excluding the '0x' prefix
    const paddedHex = hex.padStart(64, '0');

    return (include0x ? '0x' : '') + paddedHex;
}

interface AddressMap {
    P: string;    // Platform chain address
    C: Hex; // C-Chain address
}

/**
 * Derives addresses from a private key
 * @param privateKeyHex - Private key in hexadecimal format
 * @returns Object containing derived addresses for different chains
 */
export function getAddresses(privateKeyHex: string, network: string): AddressMap {
    const networkPrefix = network === 'mainnet' ? 'avax' : 'fuji';
    const publicKey = secp256k1.getPublicKey(hexToBytes(privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex));

    const pChainAddress = `P-${utils.formatBech32(
        networkPrefix,
        secp256k1.publicKeyBytesToAddress(publicKey)
    )}`;

    const cChainAddress = Address.fromPublicKey(publicKey) as Hex;

    return {
        C: cChainAddress,
        P: pChainAddress
    };
}

/**
 * Validates a private key format
 * @param privateKeyHex - Private key in hexadecimal format
 * @returns boolean indicating if the format is valid
 */
export function isValidPrivateKey(privateKeyHex: string): boolean {
    try {
        if (!privateKeyHex.match(/^[0-9a-fA-F]{64}$/)) {
            return false;
        }
        const privateKey = hexToBytes(privateKeyHex);
        return privateKey.length === 32;
    } catch {
        return false;
    }
}

export function bytesToCB58(bytes: Uint8Array): string {
    // Calculate checksum (first 4 bytes of sha256)
    const checksum = sha256(bytes).slice(0, 4);

    // Concatenate bytes and checksum
    const withChecksum = new Uint8Array(bytes.length + 4);
    withChecksum.set(bytes);
    withChecksum.set(checksum, bytes.length);

    // Encode to base58
    return base58.encode(withChecksum);
}

export type NodeId = `NodeID-${string}`;

export const parseNodeID = (nodeID: NodeId, padding = true): Hex => {
    const nodeIDWithoutPrefix = nodeID.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix)
    const nodeIDHex = fromBytes(decodedID, 'hex')
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8)
    return padding ? pad(nodeIDHexTrimmed as Hex, { size: 32 }) as Hex : nodeIDHexTrimmed as Hex;
}

export const encodeNodeID = (nodeIDBytes: Hex): NodeId => {
    let nodeU8Array = hexToUint8Array(nodeIDBytes)
    nodeU8Array = nodeU8Array.length === 32 ? nodeU8Array.slice(12) : nodeU8Array;// Remove the first 12 bytes if it's a full bytes32
    const nodeId = `NodeID-${utils.base58check.encode(nodeU8Array)}`;
    return nodeId as NodeId;
}

export function nToAVAX(value: bigint): string {
    const avaxValue = value / BigInt(1e9);
    const decimalValue = value % BigInt(1e9);
    const decimalString = decimalValue.toString().padStart(9, '0');
    return `${avaxValue}.${decimalString}`;
}

export async function retryWhileError<T>(
    fetcher: () => Promise<T>,
    intervalMs: number,
    timeoutMs: number,
    accept: (result: T) => boolean = () => true
): Promise<T> {
    const start = Date.now();
    let lastErr: unknown;

    while (true) {
        try {
            const result = await fetcher();
            if (accept(result)) return result;
            else throw new Error("retryWhileError Result not accepted by:\n" + accept.toString() + "\n");
        } catch (e) {
            lastErr = e;
            const elapsed = Date.now() - start;
            const remaining = timeoutMs - elapsed;
            if (remaining <= 0) break;
            await new Promise(res => setTimeout(res, Math.min(intervalMs, remaining)));
        }
    }

    logger.error("Timeout reached !\n", lastErr);
    process.exit(1);
}

export function bigintReplacer(_key: string, value: any) {
    if (typeof value === "bigint") {
        return Number(value);
    }
    return value;
}

export function getClipboardValue(): string {
    let result: string;
    const platform = process.platform;

    if (platform === 'win32') {
        // Windows
        result = spawnSync('powershell', ['-command', 'Get-Clipboard'], { encoding: 'utf-8' }).stdout;
    } else if (platform === 'darwin') {
        // macOS
        result = spawnSync('pbpaste', [], { encoding: 'utf-8' }).stdout;
    } else {
        // Linux and others
        result = spawnSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf-8' }).stdout;
    }

    return result.trim();
}

export function setClipboardValue(value: string): void {
    const platform = process.platform;

    if (platform === 'win32') {
        // Windows
        spawnSync('powershell', ['-command', `Set-Clipboard -Value "${value.replace(/"/g, '""')}"`], { encoding: 'utf-8' });
    } else if (platform === 'darwin') {
        // macOS
        const proc = spawnSync('pbcopy', [], { input: value, encoding: 'utf-8' });
    } else {
        // Linux and others
        spawnSync('xclip', ['-selection', 'clipboard'], { input: value, encoding: 'utf-8' });
    }
}
