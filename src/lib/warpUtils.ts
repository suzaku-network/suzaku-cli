import { fromBytes, hexToBytes, Hex } from 'viem';
import { sha256 } from '@noble/hashes/sha256';
import { cb58ToBytes, bytesToCB58, interruptiblePause } from './utils';
import { PChainOwner } from './justification';
import { utils } from '@avalabs/avalanchejs';
import { cb58ToHex } from './utils';
import { Network } from '../client';
import { pChainChainID } from '../config';

interface PackL1ConversionMessageArgs {
    subnetId: string;
    managerChainID: string;
    managerAddress: Hex;
    validators: SubnetToL1ConversionValidatorData[];
}

interface SubnetToL1ConversionValidatorData {
    nodeID: string;
    nodePOP: {
        publicKey: Hex;
        proofOfPossession: Hex;
    };
    weight: number;
}

// Helper functions for packing messages
const codecVersion = 0;
const encodeUint16 = (num: number): Uint8Array => encodeNumber(num, 2);
const encodeUint32 = (num: number): Uint8Array => encodeNumber(num, 4);
const encodeUint64 = (num: bigint): Uint8Array => encodeNumber(num, 8);

function encodeNumber(num: number | bigint, numberBytes: number): Uint8Array {
    const arr = new Uint8Array(numberBytes);
    const isBigInt = typeof num === 'bigint';
    let value = isBigInt ? num : BigInt(num);
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

export function packL1ConversionMessage(args: PackL1ConversionMessageArgs, networkID: number, sourceChainID: string): [Uint8Array, Uint8Array] {
    const data = marshalSubnetToL1ConversionData(args);
    const subnetConversionID = sha256(data);

    console.log("ConversionData SHA256:", fromBytes(subnetConversionID, 'hex'));
    console.log("ConversionData CB58:", bytesToCB58(subnetConversionID));

    const addressedCallPayload = newSubnetToL1Conversion(subnetConversionID);
    const subnetConversionAddressedCall = newAddressedCall(new Uint8Array([]), addressedCallPayload);
    const unsignedMessage = newUnsignedMessage(networkID, sourceChainID, subnetConversionAddressedCall);
    return [unsignedMessage, cb58ToBytes(args.subnetId)];
}

function marshalSubnetToL1ConversionData(args: PackL1ConversionMessageArgs): Uint8Array {
    const parts: Uint8Array[] = [];
    parts.push(encodeUint16(codecVersion));
    parts.push(cb58ToBytes(args.subnetId));
    parts.push(cb58ToBytes(args.managerChainID));
    parts.push(encodeVarBytes(hexToBytes(args.managerAddress)));
    parts.push(encodeUint32(args.validators.length));

    for (const validator of args.validators) {
        parts.push(encodeVarBytes(cb58ToBytes(validator.nodeID.split("-")[1])));
        parts.push(hexToBytes(validator.nodePOP.publicKey));
        parts.push(encodeUint64(BigInt(validator.weight)));
    }

    return concatenateUint8Arrays(...parts);
}

function newAddressedCall(sourceAddress: Uint8Array, payload: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(1),
        encodeVarBytes(sourceAddress),
        encodeVarBytes(payload)
    );
}

function newSubnetToL1Conversion(subnetConversionID: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(0),
        subnetConversionID
    );
}

function newUnsignedMessage(networkID: number, sourceChainID: string, message: Uint8Array): Uint8Array {
    return concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(networkID),
        cb58ToBytes(sourceChainID),
        encodeUint32(message.length),
        message
    );
}

export function packWarpIntoAccessList(warpMessageBytes: Uint8Array): [{
    address: Hex,
    storageKeys: Hex[]
}] {
    const CHUNK_SIZE = 32;
    const chunks: string[] = [];
    let currentChunk = Array.from(warpMessageBytes);

    // Add 0xFF terminator
    currentChunk.push(0xFF);

    // Pad to multiple of 32 bytes with zeros
    const paddingNeeded = (CHUNK_SIZE - (currentChunk.length % CHUNK_SIZE)) % CHUNK_SIZE;
    currentChunk = currentChunk.concat(Array(paddingNeeded).fill(0));

    // Split into 32-byte chunks
    for (let i = 0; i < currentChunk.length; i += CHUNK_SIZE) {
        const chunk = currentChunk.slice(i, i + CHUNK_SIZE);
        const hexChunk = chunk
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        chunks.push(`0x${hexChunk}`);
    }

    return [{
        address: "0x0200000000000000000000000000000000000005",
        storageKeys: chunks as Hex[]
    }];
}

interface SignatureResponse {
    signedMessage: string;
}

export async function collectSignaturesInitializeValidatorSet(params: {
    network: Network, 
    subnetId: string;
    validatorManagerBlockchainID: string;
    managerAddress: Hex;
    validators: {
        nodeID: string;
        blsPublicKey: string;
        blsProofOfPossession: string;
        weight: number;
        balance: number;
    }[];
}): Promise<string> {

    // Pack the message locally
    const [message, justification] = packL1ConversionMessage({
        subnetId: params.subnetId,
        managerChainID: params.validatorManagerBlockchainID,
        managerAddress: params.managerAddress,
        validators: params.validators.map(v => ({
            nodeID: v.nodeID,
            nodePOP: {
                publicKey: v.blsPublicKey as Hex,
                proofOfPossession: v.blsProofOfPossession as Hex
            },
            weight: v.weight
        }))
    }, 5, pChainChainID);

    // Add 30 second pause
    await interruptiblePause(30);

    console.log("Message:", fromBytes(message, 'hex'));
    console.log("Justification:", fromBytes(justification, 'hex'));

    // Use the signature aggregation API from Glacier
    const baseURL = params.network === 'fuji' ? 'https://glacier-api-dev.avax.network/v1/signatureAggregator/fuji/aggregateSignatures' : 'https://glacier-api.avax.network/v1/signatureAggregator/mainnet/aggregateSignatures';
    const signResponse = await fetch(baseURL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "message": fromBytes(message, 'hex'),
            "justification": fromBytes(justification, 'hex')
        })
    });

    if (!signResponse.ok) {
        const errorText = await signResponse.text();
        throw new Error(errorText || `HTTP error! status: ${signResponse.status}`);
    }

    const { signedMessage } = await signResponse.json() as SignatureResponse;
    return signedMessage;
}

export async function collectSignatures(network: Network, message: string, justification?: string): Promise<string> {
    // Add 30 second pause
    await interruptiblePause(30);

    // Use the signature aggregation API from Glacier
    const body: { message: string; justification?: string; signingSubnetId?: string } = { message };
    if (justification) {
        body.justification = justification;
        // body.signingSubnetId = pChainChainID;
    }

    // console.log("message", message);
    // console.log("justification", justification);
    const baseURL = network === 'fuji' ? 'https://glacier-api-dev.avax.network/v1/signatureAggregator/fuji/aggregateSignatures' : 'https://glacier-api.avax.network/v1/signatureAggregator/mainnet/aggregateSignatures';
    const signResponse = await fetch(baseURL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    if (!signResponse.ok) {
        const errorText = await signResponse.text();
        throw new Error(errorText || `HTTP error! status: ${signResponse.status}`);
    }

    const { signedMessage } = await signResponse.json() as SignatureResponse;
    return signedMessage;
}

// Add new function to pack L1 validator registration message
export function packL1ValidatorRegistration(
    validationID: Uint8Array,
    registered: boolean,
    networkID: number,
    sourceChainID: string
): Uint8Array {
    // Validate validationID length
    if (validationID.length !== 32) {
        throw new Error('ValidationID must be exactly 32 bytes');
    }

    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(2), // L1_VALIDATOR_REGISTRATION_MESSAGE_TYPE_ID
        validationID,
        new Uint8Array([registered ? 1 : 0])
    );

    // Create addressed call with empty source address
    const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload);

    // Create unsigned message
    return newUnsignedMessage(networkID, sourceChainID, addressedCall);
}

// Add new function to pack L1 validator weight message
export function packL1ValidatorWeightMessage(
    validationID: Uint8Array,
    nonce: bigint,
    weight: bigint,
    networkID: number,
    sourceChainID: string
): Uint8Array {
    // Validate validationID length
    if (validationID.length !== 32) {
        throw new Error('ValidationID must be exactly 32 bytes');
    }

    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(3), // L1_VALIDATOR_WEIGHT_MESSAGE_TYPE_ID
        validationID,
        encodeUint64(nonce),
        encodeUint64(weight)
    );

    // Create addressed call with empty source address
    const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload);

    // Create unsigned message
    return newUnsignedMessage(networkID, sourceChainID, addressedCall);
}


// Mirrors Solidity's ValidationPeriod struct
export interface SolidityValidationPeriod {
    subnetID: Uint8Array; // bytes32
    nodeID: Uint8Array; // bytes
    blsPublicKey: Uint8Array; // bytes (expected length 48)
    registrationExpiry: bigint; // uint64
    remainingBalanceOwner: PChainOwner; // Uses existing PChainOwner, ensure threshold is handled as uint32 if needed
    disableOwner: PChainOwner; // Uses existing PChainOwner, ensure threshold is handled as uint32 if needed
    weight: bigint; // uint64
}


// --- Constants ---
const CODEC_ID = 0; // uint16 internal constant CODEC_ID = 0; (replaces codecVersion variable)
// const codecVersion = 0; // Replaced by CODEC_ID

const SUBNET_TO_L1_CONVERSION_MESSAGE_TYPE_ID = 0; // uint32
const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID = 1; // uint32 (already defined in original file)
const L1_VALIDATOR_REGISTRATION_MESSAGE_TYPE_ID = 2; // uint32 (already defined in original file)
const L1_VALIDATOR_WEIGHT_MESSAGE_TYPE_ID = 3; // uint32
const VALIDATION_UPTIME_MESSAGE_TYPE_ID = 0; // uint32 (Note: same as SUBNET_TO_L1_CONVERSION_MESSAGE_TYPE_ID)



// --- RegisterL1ValidatorMessage ---

// Function to pack *only* the payload using the SolidityValidationPeriod interface.
export function packRegisterL1ValidatorPayload(validationPeriod: SolidityValidationPeriod): Uint8Array {
    if (validationPeriod.blsPublicKey.length !== 48) {
        throw new Error('Invalid BLS public key length, expected 48 bytes');
    }

    const parts: Uint8Array[] = [];
    parts.push(encodeUint16(CODEC_ID));
    parts.push(encodeUint32(REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID));

    if (validationPeriod.subnetID.length !== 32) throw new Error("subnetID must be 32 bytes");
    parts.push(validationPeriod.subnetID);

    parts.push(encodeVarBytes(validationPeriod.nodeID)); // Includes length prefix

    parts.push(validationPeriod.blsPublicKey);
    parts.push(encodeUint64(validationPeriod.registrationExpiry));

    // remainingBalanceOwner
    parts.push(encodeUint32(validationPeriod.remainingBalanceOwner.threshold));
    parts.push(encodeUint32(validationPeriod.remainingBalanceOwner.addresses.length));
    for (const address of validationPeriod.remainingBalanceOwner.addresses) {
        const addrBytes = utils.hexToBuffer(address);
        if (addrBytes.length !== 20) throw new Error("Owner address must be 20 bytes hex string");
        parts.push(addrBytes);
    }

    // disableOwner
    parts.push(encodeUint32(validationPeriod.disableOwner.threshold));
    parts.push(encodeUint32(validationPeriod.disableOwner.addresses.length));
    for (const address of validationPeriod.disableOwner.addresses) {
        const addrBytes = utils.hexToBuffer(address);
        if (addrBytes.length !== 20) throw new Error("Owner address must be 20 bytes hex string");
        parts.push(addrBytes);
    }

    parts.push(encodeUint64(validationPeriod.weight));

    return concatenateUint8Arrays(...parts);
}


/**
 * Parses the payload of a RegisterL1ValidatorMessage into the SolidityValidationPeriod structure.
 * Mirrors Solidity's unpackRegisterL1ValidatorMessage.
 */
export function unpackRegisterL1ValidatorPayload(input: Uint8Array): SolidityValidationPeriod {
    let index = 0;
    const validation: Partial<SolidityValidationPeriod> = {
        remainingBalanceOwner: { threshold: 0, addresses: [] },
        disableOwner: { threshold: 0, addresses: [] },
    };

    // Unpack codec ID
    const codecID = parseUint16(input, index);
    if (codecID !== CODEC_ID) {
        throw new Error(`Invalid codec ID: ${codecID}`);
    }
    index += 2;

    // Unpack type ID
    const typeID = parseUint32(input, index);
    if (typeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID) {
        throw new Error(`Invalid message type: ${typeID}`);
    }
    index += 4;

    // Unpack subnetID
    validation.subnetID = parseBytes(input, index, 32);
    index += 32;

    // Unpack nodeID (var bytes)
    const { bytes: nodeIDBytes, newOffset: nodeIDEndOffset } = parseVarBytes(input, index);
    validation.nodeID = nodeIDBytes;
    index = nodeIDEndOffset;


    // Unpack BLS public key
    validation.blsPublicKey = parseBytes(input, index, 48);
    index += 48;

    // Unpack registration expiry
    validation.registrationExpiry = parseUint64(input, index);
    index += 8;

    // Unpack remainingBalanceOwner threshold
    validation.remainingBalanceOwner!.threshold = parseUint32(input, index);
    index += 4;
    // Unpack remainingBalanceOwner addresses length
    const remainingBalanceOwnerAddressesLength = parseUint32(input, index);
    index += 4;
    // Unpack remainingBalanceOwner addresses
    validation.remainingBalanceOwner!.addresses = [];
    for (let i = 0; i < remainingBalanceOwnerAddressesLength; i++) {
        const addrBytes = parseBytes(input, index, 20);
        validation.remainingBalanceOwner!.addresses.push(bytesToHexPrefixed(addrBytes));
        index += 20;
    }

    // Unpack disableOwner threshold
    validation.disableOwner!.threshold = parseUint32(input, index);
    index += 4;
    // Unpack disableOwner addresses length
    const disableOwnerAddressesLength = parseUint32(input, index);
    index += 4;
    // Unpack disableOwner addresses
    validation.disableOwner!.addresses = [];
    for (let i = 0; i < disableOwnerAddressesLength; i++) {
        const addrBytes = parseBytes(input, index, 20);
        validation.disableOwner!.addresses.push(bytesToHexPrefixed(addrBytes));
        index += 20;
    }

    // Unpack weight
    validation.weight = parseUint64(input, index);
    index += 8;

    // Validate total length by comparing the final index with input length
    if (index !== input.length) {
        // Calculate expected length based on parsed variable fields for better error message
        const expectedLength = 2 + 4 + 32 + (4 + validation.nodeID.length) + 48 + 8 +
            (4 + 4 + remainingBalanceOwnerAddressesLength * 20) +
            (4 + 4 + disableOwnerAddressesLength * 20) + 8;
        throw new Error(`Invalid message length: parsed ${index} bytes, expected ${expectedLength}, total length ${input.length}`);
    }

    return validation as SolidityValidationPeriod;
}

// Helper functions for parsing numbers (already exist at end of file, moved up for clarity)
function parseUint16(input: Uint8Array, offset: number): number {
    if (offset + 2 > input.length) throw new Error("parseUint16: Offset out of bounds");
    let result = 0;
    for (let i = 0; i < 2; i++) {
        result = (result << 8) | input[offset + i];
    }
    return result;
}

function parseUint32(input: Uint8Array, offset: number): number {
    if (offset + 4 > input.length) throw new Error("parseUint32: Offset out of bounds");
    let result = 0;
    for (let i = 0; i < 4; i++) {
        result = (result << 8) | input[offset + i];
    }
    // Return as unsigned integer
    return result >>> 0;
}

function parseUint64(input: Uint8Array, offset: number): bigint {
    if (offset + 8 > input.length) throw new Error("parseUint64: Offset out of bounds");
    let result = 0n;
    for (let i = 0; i < 8; i++) {
        result = (result << 8n) | BigInt(input[offset + i]);
    }
    return result;
}

function parseBytes(input: Uint8Array, offset: number, length: number): Uint8Array {
    if (offset + length > input.length) throw new Error("parseBytes: Offset/length out of bounds");
    return input.slice(offset, offset + length);
}

function parseVarBytes(input: Uint8Array, offset: number): { bytes: Uint8Array; newOffset: number } {
    const length = parseUint32(input, offset);
    const newOffset = offset + 4;
    const bytes = parseBytes(input, newOffset, length);
    return { bytes, newOffset: newOffset + length };
}

const bytesToHexPrefixed = (bytes: Uint8Array): Hex => `0x${Buffer.from(bytes).toString('hex')}`;

export function packValidationUptimeMessage(validationId: string, uptimeSeconds: number, networkID: number, sourceChainID: string): Uint8Array {
    let validationIdBytes: Uint8Array;

    // Convert validationId to hex
    const validationIdHex = cb58ToHex(validationId);
    validationIdBytes = hexToBytes(validationIdHex as Hex);

    // Create the message payload with the proper format
    const messagePayload = concatenateUint8Arrays(
        encodeUint16(codecVersion),
        encodeUint32(VALIDATION_UPTIME_MESSAGE_TYPE_ID),
        validationIdBytes,
        encodeUint64(BigInt(uptimeSeconds))
    );

    // Create addressed call with empty source address
    const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload);

    // Create unsigned message
    return newUnsignedMessage(networkID, sourceChainID, addressedCall);
}
