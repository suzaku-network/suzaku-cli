import { utils, secp256k1 } from "@avalabs/avalanchejs";
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Address } from 'micro-eth-signer';
import { sha256 } from '@noble/hashes/sha256';
import { base58 } from '@scure/base';
import * as readline from 'readline';
import { fromBytes, Hex, pad } from "viem";

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
export function getAddresses(privateKeyHex: string): AddressMap {
    const publicKey = secp256k1.getPublicKey(hexToBytes(privateKeyHex));

    const pChainAddress = `P-${utils.formatBech32(
        "fuji",
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

export async function interruptiblePause(seconds: number): Promise<void> {
    console.log(`\nWaiting ${seconds} seconds before aggregating signatures...`);

    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Set raw mode to detect space key
        process.stdin.setRawMode?.(true);

        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, seconds * 1000);

        function cleanup() {
            rl.close();
            process.stdin.setRawMode?.(false);
            process.stdin.removeListener('keypress', handleKeypress);
        }

        function handleKeypress(key: string) {
            if (key === '\r' || key === ' ') {
                clearTimeout(timer);
                cleanup();
                resolve();
            }
        }

        process.stdin.on('keypress', handleKeypress);
    });
}

export type NodeId = `NodeID-${string}`;

export const parseNodeID = (nodeID: NodeId): Hex => {
    const nodeIDWithoutPrefix = nodeID.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix)
    const nodeIDHex = fromBytes(decodedID, 'hex')
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8)
    const padded = pad(nodeIDHexTrimmed as Hex, { size: 32 })
    return padded as Hex
}
