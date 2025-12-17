// Using more generic types without specific library dependencies
import { Buffer } from 'buffer';
import { parseAbiItem, Hex, hexToBytes } from 'viem';
import { utils } from '@avalabs/avalanchejs';
import { sha256 } from '@noble/hashes/sha256';
import { SolidityValidationPeriod, packRegisterL1ValidatorPayload, unpackRegisterL1ValidatorPayload } from './warpUtils';
import { ExtendedPublicClient } from '../client';
import { logger } from './logger';

const codecVersion = 0;
const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID = 1;

/**
 * Extracts the addressedCall from an unsignedWarpMessage
 * 
 * UnsignedMessage structure from convertWarp:
 * - codecVersion (uint16 - 2 bytes)
 * - networkID (uint32 - 4 bytes)
 * - sourceChainID (32 bytes)
 * - message length (uint32 - 4 bytes)
 * - message (the variable-length bytes we want)
 * 
 * @param messageBytes - The raw unsignedWarpMessage bytes
 * @returns The extracted message (addressedCall)
 */
function extractAddressedCall(messageBytes: Uint8Array): Uint8Array {
    try {
        // logger.log(`Parsing UnsignedMessage of length: ${messageBytes.length} bytes`);

        if (messageBytes.length < 42) { // 2 + 4 + 32 + 4 = minimum 42 bytes
            // logger.log('UnsignedMessage too short');
            return new Uint8Array();
        }

        // const codecVersion = (messageBytes[0] << 8) | messageBytes[1];
        // logger.log(`Raw codecVersion bytes: 0x${Buffer.from([messageBytes[0], messageBytes[1]]).toString('hex')}`);

        // const networkIDBytes = messageBytes.slice(2, 6);
        // logger.log(`Raw networkID bytes: 0x${Buffer.from(networkIDBytes).toString('hex')}`);
        // const networkID = (messageBytes[2] << 24) |
        //     (messageBytes[3] << 16) |
        //     (messageBytes[4] << 8) |
        //     messageBytes[5];

        // logger.log(`UnsignedMessage -> codecVersion: ${codecVersion}, NetworkID: ${networkID}`);

        // const sourceChainIDBytes = messageBytes.slice(6, 38);
        // logger.log(`Raw sourceChainID bytes: 0x${Buffer.from(sourceChainIDBytes).toString('hex')}`);
        // try {
        //     let sourceChainIDStr = utils.base58check.encode(Buffer.from(sourceChainIDBytes));
        //     logger.log(`UnsignedMessage -> SourceChainID: ${sourceChainIDStr}`);
        // } catch (e) {
        //     logger.log('Could not encode sourceChainID from UnsignedMessage');
        // }

        const messageLength = (messageBytes[38] << 24) |
            (messageBytes[39] << 16) |
            (messageBytes[40] << 8) |
            messageBytes[41];

        // logger.log(`UnsignedMessage -> AddressedCall length: ${messageLength} bytes`);

        if (messageLength <= 0 || 42 + messageLength > messageBytes.length) {
            // logger.log('Invalid message length or message extends beyond UnsignedMessage data bounds');
            return new Uint8Array();
        }

        const addressedCall = messageBytes.slice(42, 42 + messageLength);
        // logger.log(`Extracted AddressedCall of length ${addressedCall.length} bytes`);

        return addressedCall;
    } catch (error) {
        logger.error('Error extracting addressedCall from UnsignedMessage:', error);
        return new Uint8Array();
    }
}

/**
 * Decodes a Base58Check encoded ID string (like SubnetID or ChainID) into its raw bytes.
 * Returns null if decoding fails.
 * @param idString - The ID string.
 * @returns The decoded bytes as Uint8Array or null.
 */
function decodeID(idString: string): Uint8Array | null {
    if (!idString) {
        logger.error("Invalid ID format: empty string");
        return null;
    }
    try {
        return utils.base58check.decode(idString);
    } catch (e) {
        logger.error("Error decoding ID:", idString, e);
        return null;
    }
}

/**
 * Decodes a Base58Check encoded NodeID string (e.g., "NodeID-...") into its raw bytes.
 * Returns null if decoding fails.
 * @param nodeIDString - The NodeID string.
 * @returns The decoded bytes as Uint8Array or null.
 */
function decodeNodeID(nodeIDString: string): Uint8Array | null {
    if (!nodeIDString || !nodeIDString.startsWith("NodeID-")) {
        logger.error("Invalid NodeID format:", nodeIDString);
        return null;
    }
    try {
        // Remove "NodeID-" prefix before decoding
        return utils.base58check.decode(nodeIDString.substring(7));
    } catch (e) {
        logger.error("Error decoding NodeID:", nodeIDString, e);
        return null;
    }
}

/**
 * Converts a non-negative integer (up to 32 bits) to a 4-byte Big Endian Uint8Array.
 * @param value - The number to convert.
 * @returns A 4-byte Uint8Array.
 */
function uint32ToBigEndianBytes(value: number): Uint8Array {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value, 0);
    return new Uint8Array(buffer);
}

/**
 * Appends a uint32 index to a byte array (typically a SubnetID) to compute a derived ID.
 * This mimics the Go `ids.ID.Append(uint32)` logic used for bootstrap validator IDs.
 * @param baseIDBytes - The base ID bytes (e.g., SubnetID).
 * @param index - The uint32 index to append.
 * @returns The combined ID bytes.
 */
function computeDerivedID(baseIDBytes: Uint8Array, index: number): Uint8Array {
    const indexBytes = uint32ToBigEndianBytes(index);
    const combined = new Uint8Array(baseIDBytes.length + indexBytes.length);
    combined.set(baseIDBytes, 0);
    combined.set(indexBytes, baseIDBytes.length);
    return combined;
}

/**
 * Compares two Uint8Arrays for byte equality.
 * @param a - First Uint8Array.
 * @param b - Second Uint8Array.
 * @returns True if arrays are identical, false otherwise.
 */
function compareBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Encodes a non-negative integer into Protobuf Varint format.
 * @param value - The non-negative integer to encode.
 * @returns A Uint8Array containing the Varint bytes.
 */
function encodeVarint(value: number): Uint8Array {
    const bytes: number[] = [];
    while (value >= 0x80) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7; // Use unsigned right shift
    }
    bytes.push(value);
    return new Uint8Array(bytes);
}

/**
 * Manually marshals the ConvertSubnetToL1TxData justification protobuf.
 * L1ValidatorRegistrationJustification {
 *   oneof preimage {
 *     // Field 1
 *     SubnetIDIndex convert_subnet_to_l1_tx_data = 1;
 *     // Field 2
 *     bytes register_l1_validator_message = 2;
 *   }
 * }
 * SubnetIDIndex {
 *   bytes subnet_id = 1; // wire type 2
 *   uint32 index = 2;   // wire type 0 (varint)
 * }
 *
 * @param subnetIDBytes - The raw bytes of the subnet ID.
 * @param index - The bootstrap index.
 * @returns The marshalled L1ValidatorRegistrationJustification bytes.
 */
function marshalConvertSubnetToL1TxDataJustification(subnetIDBytes: Uint8Array, index: number): Uint8Array {
    // Marshal Inner SubnetIDIndex message
    // Field 1: subnet_id (bytes)
    const subnetIdTag = new Uint8Array([0x0a]); // Field 1, wire type 2
    const subnetIdLen = encodeVarint(subnetIDBytes.length);
    // Field 2: index (uint32, varint)
    const indexTag = new Uint8Array([0x10]); // Field 2, wire type 0
    const indexVarint = encodeVarint(index);

    const innerMsgLength = subnetIdTag.length + subnetIdLen.length + subnetIDBytes.length + indexTag.length + indexVarint.length;
    const innerMsgBytes = new Uint8Array(innerMsgLength);
    let offset = 0;
    innerMsgBytes.set(subnetIdTag, offset); offset += subnetIdTag.length;
    innerMsgBytes.set(subnetIdLen, offset); offset += subnetIdLen.length;
    innerMsgBytes.set(subnetIDBytes, offset); offset += subnetIDBytes.length;
    innerMsgBytes.set(indexTag, offset); offset += indexTag.length;
    innerMsgBytes.set(indexVarint, offset);

    // Marshal Outer L1ValidatorRegistrationJustification message
    // Field 1: convert_subnet_to_l1_tx_data (message)
    const outerTag = new Uint8Array([0x0a]); // Field 1, wire type 2
    const outerLen = encodeVarint(innerMsgBytes.length);

    const justificationBytes = new Uint8Array(outerTag.length + outerLen.length + innerMsgBytes.length);
    offset = 0;
    justificationBytes.set(outerTag, offset); offset += outerTag.length;
    justificationBytes.set(outerLen, offset); offset += outerLen.length;
    justificationBytes.set(innerMsgBytes, offset);

    return justificationBytes;
}

/**
 * Extracts the payload bytes from an AddressedCall byte array.
 * Assumes AddressedCall structure:
 * - TypeID (4 bytes, starting at index 2)
 * - Source Address Length (4 bytes, starting at index 6)
 * - Source Address (variable)
 * - Payload Length (4 bytes, starting after source address)
 * - Payload (variable)
 *
 * @param addressedCall - The AddressedCall bytes.
 * @returns The extracted payload as a Uint8Array, or null if parsing fails or data is insufficient.
 */
export function extractPayloadFromAddressedCall(addressedCall: Uint8Array): Uint8Array | null {
    try {
        // Need at least 10 bytes for TypeID and Source Address Length.
        if (addressedCall.length < 10) {
            //   logger.warn('AddressedCall too short to contain Source Address Length');
            return null;
        }

        // Source Address Length starts at index 6
        const sourceAddrLen = (addressedCall[6] << 24) | (addressedCall[7] << 16) | (addressedCall[8] << 8) | addressedCall[9];
        if (sourceAddrLen < 0) { // Should not happen with unsigned bytes, but good practice
            // logger.warn('Invalid Source Address Length (<0)');
            return null;
        }

        // Position where Payload Length starts
        const payloadLenPos = 10 + sourceAddrLen;

        // Check if we have enough bytes to read Payload Length
        if (payloadLenPos + 4 > addressedCall.length) {
            //   logger.warn('AddressedCall too short to contain Payload Length');
            return null;
        }

        // Read Payload Length
        const payloadLen = (addressedCall[payloadLenPos] << 24) |
            (addressedCall[payloadLenPos + 1] << 16) |
            (addressedCall[payloadLenPos + 2] << 8) |
            addressedCall[payloadLenPos + 3];

        // Check if payload length is valid
        if (payloadLen <= 0) {
            // logger.warn('Invalid Payload Length (<=0)');
            return null;
        }

        const payloadStartPos = payloadLenPos + 4;
        const payloadEndPos = payloadStartPos + payloadLen;

        // Check if payload extends beyond data bounds
        if (payloadEndPos > addressedCall.length) {
            // logger.warn('Payload extends beyond AddressedCall data bounds');
            return null;
        }

        // Extract Payload
        const payloadBytes = addressedCall.slice(payloadStartPos, payloadEndPos);
        return payloadBytes;

    } catch (error) {
        logger.error('Error extracting payload from AddressedCall:', error);
        return null;
    }
}

/**
 * Calculates the validationID hash for a RegisterL1ValidatorMessage payload.
 * Uses the SolidityValidationPeriod interface.
 */
export function calculateValidationID(validationPeriod: SolidityValidationPeriod): Uint8Array {
    const payload = packRegisterL1ValidatorPayload(validationPeriod);
    return sha256(payload);
}

// Define the ABI for the SendWarpMessage event
const sendWarpMessageEventAbi = parseAbiItem(
    'event SendWarpMessage(address indexed sourceAddress, bytes32 indexed unsignedMessageID, bytes message)'
);

/**
 * Gets the marshalled L1ValidatorRegistrationJustification protobuf bytes for a specific
 * validation ID and subnet. It first checks if the validation ID corresponds to the hash
 * of a derived bootstrap validator ID (SubnetID + Index). If not found, it queries
 * Warp logs for a RegisterL1ValidatorMessage payload whose hash matches the validation ID
 * and constructs the justification using that message payload.
 *
 * @param nodeID - The node ID of the validator (e.g., "NodeID-..."), used for logging and secondary confirmation.
 * @param validationIDHex - The target validation ID as a '0x' prefixed hex string (bytes32).
 * @param subnetIDStr - The subnet ID as a Base58Check string.
 * @param ExtendedPublicClient - A client that can perform getLogs operations.
 * @returns The marshalled L1ValidatorRegistrationJustification bytes as a Uint8Array, or null if not found/error.
 */
export async function GetRegistrationJustification(
    nodeID: string, // Keep for logging/confirmation
    validationIDHex: string,
    subnetIDStr: string,
    ExtendedPublicClient: { getLogs: ExtendedPublicClient['getLogs'] },
    latestBlock?: bigint | 0
): Promise<Uint8Array | null> {
    const WARP_ADDRESS = '0x0200000000000000000000000000000000000005' as const;
    const NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH = 100;

    let targetValidationIDBytes: Uint8Array;
    try {
        targetValidationIDBytes = hexToBytes(validationIDHex as Hex);
        if (targetValidationIDBytes.length !== 32) {
            throw new Error(`Decoded validationID must be 32 bytes, got ${targetValidationIDBytes.length}`);
        }
    } catch (e: any) {
        logger.error(`Failed to decode provided validationIDHex '${validationIDHex}': ${e.message}`);
        return null;
    }

    const subnetIDBytes = decodeID(subnetIDStr);
    const targetNodeIDBytes = decodeNodeID(nodeID); // Decode for log confirmation

    if (!subnetIDBytes) {
        logger.error(`Failed to decode provided SubnetID: ${subnetIDStr}`);
        return null;
    }
    if (!targetNodeIDBytes) {
        logger.warn(`Failed to decode provided NodeID for confirmation: ${nodeID}`);
        // Allow continuing without targetNodeIDBytes for confirmation
    }

    // 1. Check for bootstrap validators (comparing hash of derived ID against targetValidationIDBytes)
    for (let index = 0; index < NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH; index++) {
        // Compute the 36-byte derived ID (SubnetID + Index)
        const bootstrapDerivedBytes = computeDerivedID(subnetIDBytes, index);
        // Compute the SHA-256 hash (32 bytes)
        const bootstrapValidationIDHash = sha256(bootstrapDerivedBytes);

        // Compare the derived hash with the target validation ID
        if (compareBytes(bootstrapValidationIDHash, targetValidationIDBytes)) {
            logger.log(`ValidationID ${validationIDHex} matches HASH of bootstrap validator derived ID (subnet ${subnetIDStr}, index ${index})`);
            // Marshal justification using the *original* subnetID and index
            const justificationBytes = marshalConvertSubnetToL1TxDataJustification(subnetIDBytes, index);
            return justificationBytes;
        }
    }
    logger.log(`ValidationID ${validationIDHex} not found within the HASHES of the first ${NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH} bootstrap validator indices for subnet ${subnetIDStr}. Checking Warp logs...`);


    // 2. If not a bootstrap validator, search Warp logs
    try {
        // Start from the latest block and search backwards in batches
        latestBlock = latestBlock ? latestBlock : await ExtendedPublicClient.getLogs({ fromBlock: 'latest' }).then(logs => logs.length > 0 ? logs[0].blockNumber : 0) || 0n;
        const BATCH_SIZE = 2048;
        let fromBlock = latestBlock;
        let toBlock = latestBlock;
        let justification: Uint8Array<ArrayBuffer> | null = null;

        logger.log(`Starting search from latest block ${latestBlock} in batches of ${BATCH_SIZE} blocks...`);

        while (fromBlock > 0n && !justification) {
            // Calculate batch range
            fromBlock = BigInt(Math.max(0, Number(toBlock) - BATCH_SIZE + 1));

            logger.log(`Searching for Warp logs in block range: ${fromBlock} to ${toBlock}...`);

            const warpLogs = await ExtendedPublicClient.getLogs({
                address: WARP_ADDRESS,
                event: sendWarpMessageEventAbi,
                fromBlock: fromBlock,
                toBlock: toBlock,
            });

            if (warpLogs.length > 0) {
                logger.log(`Found ${warpLogs.length} Warp logs in block range ${fromBlock}-${toBlock}. Searching for justification matching ValidationID ${validationIDHex}...`);

                for (const log of warpLogs) {
                    try {
                        const decodedArgs = log.args as { message?: Hex };
                        const fullMessageHex = decodedArgs.message;
                        if (!fullMessageHex) continue;

                        const unsignedMessageBytes = Buffer.from(fullMessageHex.slice(2), 'hex');
                        const addressedCall = extractAddressedCall(unsignedMessageBytes);
                        if (addressedCall.length === 0) continue;

                        // Check TypeID within AddressedCall for RegisterL1ValidatorMessage
                        if (addressedCall.length < 6) continue;
                        const acTypeID = (addressedCall[2] << 24) | (addressedCall[3] << 16) | (addressedCall[4] << 8) | addressedCall[5];
                        const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID_IN_AC = 1;
                        if (acTypeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID_IN_AC) {
                            continue;
                        }

                        const payloadBytes = extractPayloadFromAddressedCall(addressedCall);
                        if (!payloadBytes) continue;

                        try {
                            // Unpack the payload
                            const parsedPayload: SolidityValidationPeriod = unpackRegisterL1ValidatorPayload(payloadBytes);
                            // Calculate the validationID (hash) of this message payload
                            const logValidationIDBytes = calculateValidationID(parsedPayload);

                            // Compare the calculated hash with the target validation ID
                            if (compareBytes(logValidationIDBytes, targetValidationIDBytes)) {
                                if (targetNodeIDBytes && !compareBytes(parsedPayload.nodeID, targetNodeIDBytes)) {
                                    logger.warn(`ValidationID match found (${validationIDHex}) in log ${log.transactionHash}, but NodeID in message (${utils.base58check.encode(Buffer.from(parsedPayload.nodeID))}) does not match expected NodeID ${nodeID}. Skipping.`);
                                    continue;
                                }

                                const tag = new Uint8Array([0x12]);
                                const lengthVarint = encodeVarint(payloadBytes.length);
                                const marshalledJustification = new Uint8Array(tag.length + lengthVarint.length + payloadBytes.length);
                                marshalledJustification.set(tag, 0);
                                marshalledJustification.set(lengthVarint, tag.length);
                                marshalledJustification.set(payloadBytes, tag.length + lengthVarint.length);

                                logger.log(`Found matching ValidationID ${validationIDHex} (NodeID ${nodeID}) in Warp log (Tx: ${log.transactionHash}, Block: ${log.blockNumber}). Marshalled justification.`);
                                justification = marshalledJustification;
                                break; // Exit the loop once found
                            }
                        } catch {
                            // logger.warn(`Error parsing/hashing RegisterL1ValidatorMessage payload from Tx ${log.transactionHash}:`, parseOrHashError);
                        }
                    } catch (logProcessingError) {
                        logger.error(`Error processing log entry for tx ${log.transactionHash}:`, logProcessingError);
                    }
                }
            } else {
                logger.log(`No Warp logs found in block range ${fromBlock}-${toBlock}.`);
            }

            // If justification was found, break out of the while loop
            if (justification) break;

            // Move to previous batch
            toBlock = fromBlock - 1n;

            // Exit if we've scanned all blocks
            if (toBlock < 0) break;
        }

        if (!justification) {
            logger.log(`No matching registration log found for ValidationID ${validationIDHex} in any Warp logs.`);
        }

        return justification;

    } catch (fetchLogError) {
        logger.error(`Error fetching or decoding logs for ValidationID ${validationIDHex}:`, fetchLogError);
        return null;
    }
}

// Helper functions

export function hexToUint8Array(hex: Hex): Uint8Array {
    // Remove '0x' prefix if present
    const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
    return Buffer.from(hexString, 'hex');
}

export interface PChainOwner {
    threshold: number;
    addresses: Hex[];
}

export interface ValidationPeriod {
    subnetId: string;
    nodeID: string;
    blsPublicKey: Hex;
    registrationExpiry: bigint;
    remainingBalanceOwner: PChainOwner;
    disableOwner: PChainOwner;
    weight: bigint;
}

/**
 * Parses a RegisterL1ValidatorMessage from a byte array.
 * The message format specification is:
 *
 * RegisterL1ValidatorMessage:
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |               codecID :      uint16 |                                                            2 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |                typeID :      uint32 |                                                            4 bytes |
 * +-----------------------+-------------+-------------------------------------------------------------------+
 * |              subnetID :    [32]byte |                                                           32 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |                nodeID :      []byte |                                              4 + len(nodeID) bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |          blsPublicKey :    [48]byte |                                                           48 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |                expiry :      uint64 |                                                            8 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * | remainingBalanceOwner : PChainOwner |                                      8 + len(addresses) * 20 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |          disableOwner : PChainOwner |                                      8 + len(addresses) * 20 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 * |                weight :      uint64 |                                                            8 bytes |
 * +-----------------------+-------------+--------------------------------------------------------------------+
 *                                       | 122 + len(nodeID) + (len(addresses1) + len(addresses2)) * 20 bytes |
 *                                       +--------------------------------------------------------------------+
 *
 * PChainOwner:
 * +-----------+------------+-------------------------------+
 * | threshold :     uint32 |                       4 bytes |
 * +-----------+------------+-------------------------------+
 * | addresses : [][20]byte | 4 + len(addresses) * 20 bytes |
 * +-----------+------------+-------------------------------+
 *                          | 8 + len(addresses) * 20 bytes |
 *                          +-------------------------------+
 */
export function parseRegisterL1ValidatorMessage(input: Uint8Array): ValidationPeriod {
    let index = 0;
    const validation: ValidationPeriod = {
        subnetId: '',
        nodeID: '',
        blsPublicKey: '0x',
        registrationExpiry: 0n,
        remainingBalanceOwner: { threshold: 0, addresses: [] },
        disableOwner: { threshold: 0, addresses: [] },
        weight: 0n
    };

    // Parse codec ID
    const codecID = parseUint16(input, index);
    if (codecID !== codecVersion) {
        throw new Error(`Invalid codec ID: ${codecID}`);
    }
    index += 2;

    // Parse type ID
    const typeID = parseUint32(input, index);
    if (typeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID) {
        throw new Error(`Invalid message type: ${typeID}`);
    }
    index += 4;

    // Parse subnetID
    const subnetIDBytes = input.slice(index, index + 32);
    validation.subnetId = utils.base58check.encode(subnetIDBytes);
    index += 32;

    // Parse nodeID length
    const nodeIDLength = parseUint32(input, index);
    index += 4;

    // Parse nodeID
    const nodeIDBytes = input.slice(index, index + nodeIDLength);
    validation.nodeID = `NodeID-${utils.base58check.encode(nodeIDBytes)}`;
    index += nodeIDLength;

    // Parse BLS public key
    const blsPublicKeyBytes = input.slice(index, index + 48);
    validation.blsPublicKey = `0x${Buffer.from(blsPublicKeyBytes).toString('hex')}`;
    index += 48;

    // Parse registration expiry
    validation.registrationExpiry = parseUint64(input, index);
    index += 8;

    // Parse remainingBalanceOwner threshold
    validation.remainingBalanceOwner.threshold = parseUint32(input, index);
    index += 4;

    // Parse remainingBalanceOwner addresses length
    const remainingBalanceOwnerAddressesLength = parseUint32(input, index);
    index += 4;

    // Parse remainingBalanceOwner addresses
    validation.remainingBalanceOwner.addresses = [];
    for (let i = 0; i < remainingBalanceOwnerAddressesLength; i++) {
        const addrBytes = input.slice(index, index + 20);
        const addr = `0x${Buffer.from(addrBytes).toString('hex')}`;
        validation.remainingBalanceOwner.addresses.push(addr as Hex);
        index += 20;
    }

    // Parse disableOwner threshold
    validation.disableOwner.threshold = parseUint32(input, index);
    index += 4;

    // Parse disableOwner addresses length
    const disableOwnerAddressesLength = parseUint32(input, index);
    index += 4;

    // Parse disableOwner addresses
    validation.disableOwner.addresses = [];
    for (let i = 0; i < disableOwnerAddressesLength; i++) {
        const addrBytes = input.slice(index, index + 20);
        const addr = `0x${Buffer.from(addrBytes).toString('hex')}`;
        validation.disableOwner.addresses.push(addr as Hex);
        index += 20;
    }

    // Validate input length
    const expectedLength = 122 + nodeIDLength + (remainingBalanceOwnerAddressesLength + disableOwnerAddressesLength) * 20;
    if (input.length !== expectedLength) {
        throw new Error(`Invalid message length: got ${input.length}, expected ${expectedLength}`);
    }

    // Parse weight
    validation.weight = parseUint64(input, index);

    return validation;
}

// Helper functions for parsing numbers
function parseUint16(input: Uint8Array, offset: number): number {
    let result = 0;
    for (let i = 0; i < 2; i++) {
        result = (result << 8) | input[offset + i];
    }
    return result;
}

export function parseUint32(input: Uint8Array, offset: number): number {
    let result = 0;
    for (let i = 0; i < 4; i++) {
        result = (result << 8) | input[offset + i];
    }
    return result;
}

function parseUint64(input: Uint8Array, offset: number): bigint {
    let result = 0n;
    for (let i = 0; i < 8; i++) {
        result = (result << 8n) | BigInt(input[offset + i]);
    }
    return result;
}
