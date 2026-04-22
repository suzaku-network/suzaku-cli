import { fromBytes, hexToBytes, Hex, slice } from 'viem';
import { sha256 } from '@noble/hashes/sha2';
import { utils } from '@avalabs/avalanchejs';
import { cb58ToBytes, cb58ToHex, unpackGeneric, retryWhileError, pChainChainID } from './avalancheUtils';
import { type Network } from './client/types';

export interface PChainOwner {
    threshold: number;
    addresses: string[];
}

export interface PackL1ConversionMessageArgs {
    subnetId: string;
    managerChainID: string;
    managerAddress: string;
    validators: SubnetToL1ConversionValidatorData[];
}

export interface SubnetToL1ConversionValidatorData {
    nodeID: string;
    nodePOP: {
        publicKey: string;
        proofOfPossession: string;
    };
    weight: number;
}

export interface SolidityValidationPeriod {
    subnetID: Uint8Array;
    nodeID: Uint8Array;
    blsPublicKey: Uint8Array;
    registrationExpiry: bigint;
    remainingBalanceOwner: PChainOwner;
    disableOwner: PChainOwner;
    weight: bigint;
}

export enum WarpMessageType {
    RegisterL1ValidatorMessage = 1,
    L1ValidatorRegistrationMessage = 2,
    L1ValidatorWeightMessage = 3,
    ValidationUptimeMessage = 0,
}

export type WarpMessage<T extends WarpMessageType> = {
    networkID: number;
    sourceChainID: string;
    unknown1: Hex;
    unknown2: Hex;
    unknown3: Hex;
    messageID: Hex;
    unknown4: Hex;
    codec: number;
    type: T;
    raw: Hex;
} & (T extends WarpMessageType.RegisterL1ValidatorMessage ? {
    validationID: Hex;
    nonce: number;
    weight: number;
} : T extends WarpMessageType.L1ValidatorRegistrationMessage ? {
    validationID: Hex;
    registered: boolean;
} : T extends WarpMessageType.L1ValidatorWeightMessage ? {
    validationID: Hex;
    weight: number;
} : T extends WarpMessageType.ValidationUptimeMessage ? {
    validationID: Hex;
    uptime: number;
} : never);

// ── Private encoding helpers ──────────────────────────────────────────────────

const CODEC_ID = 0;
const codecVersion = 0;
const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID = 1;
const VALIDATION_UPTIME_MESSAGE_TYPE_ID = 0;

const encodeUint16 = (num: number): Uint8Array => encodeNumber(num, 2);
const encodeUint32 = (num: number): Uint8Array => encodeNumber(num, 4);
const encodeUint64 = (num: bigint): Uint8Array => encodeNumber(num, 8);

function encodeNumber(num: number | bigint, numberBytes: number): Uint8Array {
    const arr = new Uint8Array(numberBytes);
    let value = typeof num === 'bigint' ? num : BigInt(num);
    for (let i = numberBytes - 1; i >= 0; i--) {
        arr[i] = Number(value & 0xffn);
        value = value >> 8n;
    }
    return arr;
}

function encodeVarBytes(bytes: Uint8Array): Uint8Array {
    const lengthBytes = encodeUint32(bytes.length);
    const result = new Uint8Array(lengthBytes.length + bytes.length);
    result.set(lengthBytes);
    result.set(bytes, lengthBytes.length);
    return result;
}

function concatenateUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

function newAddressedCall(sourceAddress: Uint8Array, payload: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(1),
        encodeVarBytes(sourceAddress),
        encodeVarBytes(payload),
    );
}

function newSubnetToL1Conversion(subnetConversionID: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(0),
        subnetConversionID,
    );
}

function newUnsignedMessage(networkID: number, sourceChainID: string, message: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(networkID),
        cb58ToBytes(sourceChainID),
        encodeUint32(message.length),
        message,
    );
}

// ── Private parsing helpers ───────────────────────────────────────────────────

function parseUint16(input: Uint8Array, offset: number): number {
    if (offset + 2 > input.length) throw new Error('parseUint16: Offset out of bounds');
    let result = 0;
    for (let i = 0; i < 2; i++) result = (result << 8) | input[offset + i];
    return result;
}

function parseUint32(input: Uint8Array, offset: number): number {
    if (offset + 4 > input.length) throw new Error('parseUint32: Offset out of bounds');
    let result = 0;
    for (let i = 0; i < 4; i++) result = (result << 8) | input[offset + i];
    return result >>> 0;
}

function parseUint64(input: Uint8Array, offset: number): bigint {
    if (offset + 8 > input.length) throw new Error('parseUint64: Offset out of bounds');
    let result = 0n;
    for (let i = 0; i < 8; i++) result = (result << 8n) | BigInt(input[offset + i]);
    return result;
}

function parseBytes(input: Uint8Array, offset: number, length: number): Uint8Array {
    if (offset + length > input.length) throw new Error('parseBytes: Offset/length out of bounds');
    return input.slice(offset, offset + length);
}

function parseVarBytes(input: Uint8Array, offset: number): { bytes: Uint8Array; newOffset: number } {
    const length = parseUint32(input, offset);
    const newOffset = offset + 4;
    const bytes = parseBytes(input, newOffset, length);
    return { bytes, newOffset: newOffset + length };
}

const bytesToHexPrefixed = (bytes: Uint8Array): Hex => fromBytes(bytes, 'hex');

// ── Public encoding functions ─────────────────────────────────────────────────

export function packL1ConversionMessage(args: PackL1ConversionMessageArgs, networkID: number, sourceChainID: string): [Uint8Array, Uint8Array] {
    const subnetConversionID = subnetToL1ConversionID(args);
    const addressedCallPayload = newSubnetToL1Conversion(subnetConversionID);
    const subnetConversionAddressedCall = newAddressedCall(new Uint8Array([]), addressedCallPayload);
    const unsignedMessage = newUnsignedMessage(networkID, sourceChainID, subnetConversionAddressedCall);
    return [unsignedMessage, utils.base58check.decode(args.subnetId)];
}

export function subnetToL1ConversionID(args: PackL1ConversionMessageArgs): Uint8Array {
    const data = marshalSubnetToL1ConversionData(args);
    return sha256(data);
}

export function marshalSubnetToL1ConversionData(args: PackL1ConversionMessageArgs): Uint8Array {
    const parts: Uint8Array[] = [];

    parts.push(encodeUint16(CODEC_ID));
    parts.push(utils.base58check.decode(args.subnetId));
    parts.push(utils.base58check.decode(args.managerChainID));
    parts.push(encodeVarBytes(utils.hexToBuffer(args.managerAddress)));
    parts.push(encodeUint32(args.validators.length));

    let sortedValidators;
    try {
        sortedValidators = [...args.validators].sort((a, b) => compareNodeIDs(a.nodeID, b.nodeID));
    } catch {
        sortedValidators = args.validators;
    }

    for (const validator of sortedValidators) {
        if (!validator.nodeID || !validator.nodePOP || !validator.nodePOP.publicKey) {
            throw new Error(`Invalid validator data: ${JSON.stringify(validator)}`);
        }

        let nodeIDBytes;
        try {
            nodeIDBytes = validator.nodeID.startsWith('NodeID-')
                ? utils.base58check.decode(validator.nodeID.split('-')[1])
                : utils.hexToBuffer(validator.nodeID);
        } catch (error: any) {
            throw new Error(`Failed to parse nodeID '${validator.nodeID}': ${error.message}`);
        }

        const blsPublicKeyBytes = utils.hexToBuffer(validator.nodePOP.publicKey);
        parts.push(encodeVarBytes(nodeIDBytes));
        parts.push(blsPublicKeyBytes);
        parts.push(encodeUint64(BigInt(validator.weight)));
    }

    return concatenateUint8Arrays(...parts);
}

export function compareNodeIDs(a: string, b: string): number {
    let aNodeID: Uint8Array;
    let bNodeID: Uint8Array;

    try {
        aNodeID = a.startsWith('NodeID-') ? utils.base58check.decode(a.split('-')[1]) : utils.hexToBuffer(a);
        bNodeID = b.startsWith('NodeID-') ? utils.base58check.decode(b.split('-')[1]) : utils.hexToBuffer(b);
    } catch {
        return a.localeCompare(b);
    }

    const minLength = Math.min(aNodeID.length, bNodeID.length);
    for (let i = 0; i < minLength; i++) {
        if (aNodeID[i] !== bNodeID[i]) return aNodeID[i] < bNodeID[i] ? -1 : 1;
    }
    return aNodeID.length - bNodeID.length;
}

export function packWarpIntoAccessList(warpMessageBytes: Uint8Array): [{ address: Hex; storageKeys: Hex[] }] {
    const CHUNK_SIZE = 32;
    let currentChunk = Array.from(warpMessageBytes);
    currentChunk.push(0xff);
    const paddingNeeded = (CHUNK_SIZE - (currentChunk.length % CHUNK_SIZE)) % CHUNK_SIZE;
    currentChunk = currentChunk.concat(Array(paddingNeeded).fill(0));

    const chunks: string[] = [];
    for (let i = 0; i < currentChunk.length; i += CHUNK_SIZE) {
        const chunk = currentChunk.slice(i, i + CHUNK_SIZE);
        chunks.push(`0x${chunk.map(byte => byte.toString(16).padStart(2, '0')).join('')}`);
    }

    return [{ address: '0x0200000000000000000000000000000000000005', storageKeys: chunks as Hex[] }];
}

export function packL1ValidatorRegistration(
    validationID: Uint8Array,
    registered: boolean,
    networkID: number,
    sourceChainID: string,
): Uint8Array {
    if (validationID.length !== 32) throw new Error('ValidationID must be exactly 32 bytes');
    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(2),
        validationID,
        new Uint8Array([registered ? 1 : 0]),
    );
    return newUnsignedMessage(networkID, sourceChainID, newAddressedCall(new Uint8Array([]), messagePayload));
}

export function packL1ValidatorWeightMessage(
    validationID: Uint8Array,
    nonce: bigint,
    weight: bigint,
    networkID: number,
    sourceChainID: string,
): Uint8Array {
    if (validationID.length !== 32) throw new Error('ValidationID must be exactly 32 bytes');
    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(3),
        validationID,
        encodeUint64(nonce),
        encodeUint64(weight),
    );
    return newUnsignedMessage(networkID, sourceChainID, newAddressedCall(new Uint8Array([]), messagePayload));
}

export function packRegisterL1ValidatorPayload(validationPeriod: SolidityValidationPeriod): Uint8Array {
    if (validationPeriod.blsPublicKey.length !== 48) {
        throw new Error('Invalid BLS public key length, expected 48 bytes');
    }
    if (validationPeriod.subnetID.length !== 32) throw new Error('subnetID must be 32 bytes');

    const parts: Uint8Array[] = [];
    parts.push(encodeUint16(CODEC_ID));
    parts.push(encodeUint32(REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID));
    parts.push(validationPeriod.subnetID);
    parts.push(encodeVarBytes(validationPeriod.nodeID));
    parts.push(validationPeriod.blsPublicKey);
    parts.push(encodeUint64(validationPeriod.registrationExpiry));

    parts.push(encodeUint32(validationPeriod.remainingBalanceOwner.threshold));
    parts.push(encodeUint32(validationPeriod.remainingBalanceOwner.addresses.length));
    for (const address of validationPeriod.remainingBalanceOwner.addresses) {
        const addrBytes = utils.hexToBuffer(address);
        if (addrBytes.length !== 20) throw new Error('Owner address must be 20 bytes hex string');
        parts.push(addrBytes);
    }

    parts.push(encodeUint32(validationPeriod.disableOwner.threshold));
    parts.push(encodeUint32(validationPeriod.disableOwner.addresses.length));
    for (const address of validationPeriod.disableOwner.addresses) {
        const addrBytes = utils.hexToBuffer(address);
        if (addrBytes.length !== 20) throw new Error('Owner address must be 20 bytes hex string');
        parts.push(addrBytes);
    }

    parts.push(encodeUint64(validationPeriod.weight));
    return concatenateUint8Arrays(...parts);
}

export function unpackRegisterL1ValidatorPayload(input: Uint8Array): SolidityValidationPeriod {
    let index = 0;
    const validation: Partial<SolidityValidationPeriod> = {
        remainingBalanceOwner: { threshold: 0, addresses: [] },
        disableOwner: { threshold: 0, addresses: [] },
    };

    const codecID = parseUint16(input, index);
    if (codecID !== CODEC_ID) throw new Error(`Invalid codec ID: ${codecID}`);
    index += 2;

    const typeID = parseUint32(input, index);
    if (typeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID) throw new Error(`Invalid message type: ${typeID}`);
    index += 4;

    validation.subnetID = parseBytes(input, index, 32);
    index += 32;

    const { bytes: nodeIDBytes, newOffset: nodeIDEndOffset } = parseVarBytes(input, index);
    validation.nodeID = nodeIDBytes;
    index = nodeIDEndOffset;

    validation.blsPublicKey = parseBytes(input, index, 48);
    index += 48;

    validation.registrationExpiry = parseUint64(input, index);
    index += 8;

    validation.remainingBalanceOwner!.threshold = parseUint32(input, index);
    index += 4;
    const remainingBalanceOwnerAddressesLength = parseUint32(input, index);
    index += 4;
    validation.remainingBalanceOwner!.addresses = [];
    for (let i = 0; i < remainingBalanceOwnerAddressesLength; i++) {
        validation.remainingBalanceOwner!.addresses.push(bytesToHexPrefixed(parseBytes(input, index, 20)));
        index += 20;
    }

    validation.disableOwner!.threshold = parseUint32(input, index);
    index += 4;
    const disableOwnerAddressesLength = parseUint32(input, index);
    index += 4;
    validation.disableOwner!.addresses = [];
    for (let i = 0; i < disableOwnerAddressesLength; i++) {
        validation.disableOwner!.addresses.push(bytesToHexPrefixed(parseBytes(input, index, 20)));
        index += 20;
    }

    validation.weight = parseUint64(input, index);
    index += 8;

    if (index !== input.length) {
        throw new Error(`Invalid message length: parsed ${index} bytes, total ${input.length}`);
    }
    return validation as SolidityValidationPeriod;
}

export function packValidationUptimeMessage(
    validationId: string,
    uptimeSeconds: number,
    networkID: number,
    sourceChainID: string,
): Uint8Array {
    const validationIdHex = cb58ToHex(validationId);
    const validationIdBytes = hexToBytes(validationIdHex);
    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(VALIDATION_UPTIME_MESSAGE_TYPE_ID),
        validationIdBytes,
        encodeUint64(BigInt(uptimeSeconds)),
    );
    return newUnsignedMessage(networkID, sourceChainID, newAddressedCall(new Uint8Array([]), messagePayload));
}

// ── Warp message schema & decoding ────────────────────────────────────────────

const decodePChainOwner = (hex: Hex) => {
    const threshold = Number(slice(hex, 0, 4));
    const addressCount = Number(slice(hex, 4, 8));
    const addresses: Hex[] = [];
    for (let i = 0; i < addressCount; i++) {
        addresses.push(slice(hex, 8 + (i * 20), 8 + ((i + 1) * 20)));
    }
    return { threshold, addresses };
};

const getOwnerSize = (hex: Hex) => {
    const addressCount = Number(slice(hex, 4, 8));
    return 8 + (addressCount * 20);
};

export const WarpMessageSchema = {
    prefix: {
        networkID: { bytes: 6, type: Number },
        sourceChainID: { bytes: 32, type: (v: Hex) => utils.base58check.encode(hexToBytes(v)) },
        unknown1: { bytes: 4, type: (v: Hex) => v },
        unknown2: { bytes: 6, type: (v: Hex) => v },
        unknown3: { bytes: 4, type: (v: Hex) => v },
        messageID: { bytes: 20, type: (v: Hex) => v },
        unknown4: { bytes: 4, type: (v: Hex) => v },
        codec: { bytes: 2, type: Number },
        type: { bytes: 4, type: Number },
    },
    3: {
        validationID: { bytes: 32, type: (v: Hex) => v },
        nonce: { bytes: 8, type: Number },
        weight: { bytes: 8, type: Number },
    },
    2: {
        validationID: { bytes: 32, type: (v: Hex) => v },
        registered: { bytes: 1, type: Boolean },
    },
    1: {
        validationID: { bytes: 32, type: (v: Hex) => v },
        subnetID: { bytes: 32, type: (v: Hex) => utils.base58check.encode(hexToBytes(v)) },
        nodeID: {
            bytes: (v: Hex) => 4 + Number(slice(v, 0, 4)),
            type: (v: Hex) => slice(v, 4),
        },
        blsPublicKey: { bytes: 48, type: (v: Hex) => v },
        expiry: { bytes: 8, type: Number },
        remainingBalanceOwner: { bytes: getOwnerSize, type: decodePChainOwner },
        disableOwner: { bytes: getOwnerSize, type: decodePChainOwner },
    },
    0: {
        validationID: { bytes: 32, type: (v: Hex) => v },
        uptime: { bytes: 8, type: Number },
    },
} as const;

export function decodeWarpMessage<T extends WarpMessageType>(hex: Hex): WarpMessage<T> {
    const { decoded: prefix, remainder: messageHex } = unpackGeneric(hex, WarpMessageSchema.prefix);
    const { decoded: message } = unpackGeneric(messageHex!, WarpMessageSchema[prefix.type as 1 | 2 | 3 | 0]);
    return { ...prefix, ...message, raw: hex } as unknown as WarpMessage<T>;
}

export function decodeWarpMessages<T extends WarpMessageType>(hexs: Hex[], type: T): WarpMessage<T>[] {
    return hexs.map((hex) => decodeWarpMessage<T>(hex)).filter((m) => m.type === type);
}

// ── Signature aggregation (uses fetch — works in browser and Node.js) ─────────

interface SignatureResponse { signedMessage: string; }

interface CollectSignaturesProps {
    network: Network;
    message: string;
    justification?: string;
    signingSubnetId?: string;
}

export async function collectSignatures({ network, message, justification, signingSubnetId }: CollectSignaturesProps): Promise<Hex> {
    const body: Record<string, unknown> = { message, signingSubnetId, quorumPercentage: 67 };
    if (justification) body.justification = justification;
    const baseURL = process.env['SIG_AGG_URL']
        ?? (network === 'fuji'
            ? 'https://glacier-api-dev.avax.network/v1/signatureAggregator/fuji/aggregateSignatures'
            : 'https://glacier-api.avax.network/v1/signatureAggregator/mainnet/aggregateSignatures');

    const signResponse = await retryWhileError(
        () => fetch(baseURL, { method: 'POST', headers: { accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        2000, 30000,
        (r) => r.status !== 500,
    );
    if (!signResponse.ok) throw new Error((await signResponse.text()) || `HTTP error! status: ${signResponse.status}`);
    const { signedMessage } = await signResponse.json() as SignatureResponse;
    return signedMessage as Hex;
}

export async function collectSignaturesInitializeValidatorSet(params: {
    network: Network;
    subnetId: string;
    validatorManagerBlockchainID: string;
    validatorManagerSubnetID: string;
    managerAddress: Hex;
    validators: { nodeID: string; blsPublicKey: string; blsProofOfPossession: string; weight: number; balance: number }[];
}): Promise<string> {
    const [message, justification] = packL1ConversionMessage(
        {
            subnetId: params.subnetId,
            managerChainID: params.validatorManagerBlockchainID,
            managerAddress: params.managerAddress,
            validators: params.validators.map(v => ({
                nodeID: v.nodeID,
                nodePOP: { publicKey: v.blsPublicKey as Hex, proofOfPossession: v.blsProofOfPossession as Hex },
                weight: v.weight,
            })),
        },
        params.network === 'fuji' ? 5 : 1,
        pChainChainID,
    );

    const baseURL = process.env['SIG_AGG_URL']
        ?? (params.network === 'fuji'
            ? 'https://glacier-api-dev.avax.network/v1/signatureAggregator/fuji/aggregateSignatures'
            : 'https://glacier-api.avax.network/v1/signatureAggregator/mainnet/aggregateSignatures');

    const signResponse = await retryWhileError(
        () => fetch(baseURL, {
            method: 'POST',
            headers: { accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: fromBytes(message, 'hex'),
                justification: fromBytes(justification, 'hex'),
                signingSubnetId: params.validatorManagerSubnetID,
            }),
        }),
        2000, 30000,
        (r) => r.status !== 500,
    );
    if (!signResponse.ok) throw new Error((await signResponse.text()) || `HTTP error! status: ${signResponse.status}`);
    const { signedMessage } = await signResponse.json() as SignatureResponse;
    return signedMessage;
}
