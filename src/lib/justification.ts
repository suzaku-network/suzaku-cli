// Using more generic types without specific library dependencies
import { Buffer } from 'buffer';
import { createPublicClient, http, parseAbiItem, Chain, Hex, PublicClient, hexToBytes } from 'viem';
import { utils } from '@avalabs/avalanchejs';
import { sha256 } from '@noble/hashes/sha256';
import { SolidityValidationPeriod, packRegisterL1ValidatorPayload, unpackRegisterL1ValidatorPayload } from './warpUtils';

const codecVersion = 0;
const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID = 1;

// Assuming these types/interfaces exist or will be defined elsewhere
interface IDs {
    ID: string;
    Append(index: number): string;
}

// Constants equivalent to the Go code
const DefaultBootstrapValidatorsToSearch = 100; // Assuming this value
const BatchSize = 1000; // Assuming this value
const RateLimitDelay = 100; // Assuming this value in milliseconds

// Cache for registration messages
const registrationMessageCache: Record<string, Uint8Array> = {};

// Interfaces for the protobuf equivalents
interface L1ValidatorRegistrationJustification {
    preimage: {
        convertSubnetToL1TxData?: {
            subnetId: Uint8Array;
            index: number;
        };
        registerL1ValidatorMessage?: Uint8Array;
    };
}


/**
 * Extracts the addressedCall from an unsignedWarpMessage
 * 
 * UnsignedMessage structure from convertWarp.ts:
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
        // console.log(`Parsing UnsignedMessage of length: ${messageBytes.length} bytes`);

        if (messageBytes.length < 42) { // 2 + 4 + 32 + 4 = minimum 42 bytes
            // console.log('UnsignedMessage too short');
            return new Uint8Array();
        }

        // const codecVersion = (messageBytes[0] << 8) | messageBytes[1];
        // console.log(`Raw codecVersion bytes: 0x${Buffer.from([messageBytes[0], messageBytes[1]]).toString('hex')}`);

        // const networkIDBytes = messageBytes.slice(2, 6);
        // console.log(`Raw networkID bytes: 0x${Buffer.from(networkIDBytes).toString('hex')}`);
        // const networkID = (messageBytes[2] << 24) |
        //     (messageBytes[3] << 16) |
        //     (messageBytes[4] << 8) |
        //     messageBytes[5];

        // console.log(`UnsignedMessage -> codecVersion: ${codecVersion}, NetworkID: ${networkID}`);

        // const sourceChainIDBytes = messageBytes.slice(6, 38);
        // console.log(`Raw sourceChainID bytes: 0x${Buffer.from(sourceChainIDBytes).toString('hex')}`);
        // try {
        //     let sourceChainIDStr = utils.base58check.encode(Buffer.from(sourceChainIDBytes));
        //     console.log(`UnsignedMessage -> SourceChainID: ${sourceChainIDStr}`);
        // } catch (e) {
        //     console.log('Could not encode sourceChainID from UnsignedMessage');
        // }

        const messageLength = (messageBytes[38] << 24) |
            (messageBytes[39] << 16) |
            (messageBytes[40] << 8) |
            messageBytes[41];

        // console.log(`UnsignedMessage -> AddressedCall length: ${messageLength} bytes`);

        if (messageLength <= 0 || 42 + messageLength > messageBytes.length) {
            // console.log('Invalid message length or message extends beyond UnsignedMessage data bounds');
            return new Uint8Array();
        }

        const addressedCall = messageBytes.slice(42, 42 + messageLength);
        // console.log(`Extracted AddressedCall of length ${addressedCall.length} bytes`);

        return addressedCall;
    } catch (error) {
        console.error('Error extracting addressedCall from UnsignedMessage:', error);
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
        console.error("Invalid ID format: empty string");
        return null;
    }
    try {
        return utils.base58check.decode(idString);
    } catch (e) {
        console.error("Error decoding ID:", idString, e);
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
        console.error("Invalid NodeID format:", nodeIDString);
        return null;
    }
    try {
        // Remove "NodeID-" prefix before decoding
        return utils.base58check.decode(nodeIDString.substring(7));
    } catch (e) {
        console.error("Error decoding NodeID:", nodeIDString, e);
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
            //   console.warn('AddressedCall too short to contain Source Address Length');
            return null;
        }

        // Source Address Length starts at index 6
        const sourceAddrLen = (addressedCall[6] << 24) | (addressedCall[7] << 16) | (addressedCall[8] << 8) | addressedCall[9];
        if (sourceAddrLen < 0) { // Should not happen with unsigned bytes, but good practice
            // console.warn('Invalid Source Address Length (<0)');
            return null;
        }

        // Position where Payload Length starts
        const payloadLenPos = 10 + sourceAddrLen;

        // Check if we have enough bytes to read Payload Length
        if (payloadLenPos + 4 > addressedCall.length) {
            //   console.warn('AddressedCall too short to contain Payload Length');
            return null;
        }

        // Read Payload Length
        const payloadLen = (addressedCall[payloadLenPos] << 24) |
            (addressedCall[payloadLenPos + 1] << 16) |
            (addressedCall[payloadLenPos + 2] << 8) |
            addressedCall[payloadLenPos + 3];

        // Check if payload length is valid
        if (payloadLen <= 0) {
            // console.warn('Invalid Payload Length (<=0)');
            return null;
        }

        const payloadStartPos = payloadLenPos + 4;
        const payloadEndPos = payloadStartPos + payloadLen;

        // Check if payload extends beyond data bounds
        if (payloadEndPos > addressedCall.length) {
            // console.warn('Payload extends beyond AddressedCall data bounds');
            return null;
        }

        // Extract Payload
        const payloadBytes = addressedCall.slice(payloadStartPos, payloadEndPos);
        return payloadBytes;

    } catch (error) {
        console.error('Error extracting payload from AddressedCall:', error);
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
 * @param publicClient - A client that can perform getLogs operations.
 * @returns The marshalled L1ValidatorRegistrationJustification bytes as a Uint8Array, or null if not found/error.
 */
export async function GetRegistrationJustification(
    nodeID: string, // Keep for logging/confirmation
    validationIDHex: string,
    subnetIDStr: string,
    publicClient: { getLogs: PublicClient['getLogs'] }
): Promise<Uint8Array | null> {
    const WARP_ADDRESS = '0x0200000000000000000000000000000000000005' as const;
    const NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH = 100;

    let targetValidationIDBytes: Uint8Array;
    try {
        targetValidationIDBytes = hexToBytes(validationIDHex as `0x${string}`);
        if (targetValidationIDBytes.length !== 32) {
            throw new Error(`Decoded validationID must be 32 bytes, got ${targetValidationIDBytes.length}`);
        }
    } catch (e: any) {
        console.error(`Failed to decode provided validationIDHex '${validationIDHex}': ${e.message}`);
        return null;
    }

    const subnetIDBytes = decodeID(subnetIDStr);
    const targetNodeIDBytes = decodeNodeID(nodeID); // Decode for log confirmation

    if (!subnetIDBytes) {
        console.error(`Failed to decode provided SubnetID: ${subnetIDStr}`);
        return null;
    }
    if (!targetNodeIDBytes) {
        console.warn(`Failed to decode provided NodeID for confirmation: ${nodeID}`);
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
            console.log(`ValidationID ${validationIDHex} matches HASH of bootstrap validator derived ID (subnet ${subnetIDStr}, index ${index})`);
            // Marshal justification using the *original* subnetID and index
            const justificationBytes = marshalConvertSubnetToL1TxDataJustification(subnetIDBytes, index);
            return justificationBytes;
        }
    }
    console.log(`ValidationID ${validationIDHex} not found within the HASHES of the first ${NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH} bootstrap validator indices for subnet ${subnetIDStr}. Checking Warp logs...`);


    // 2. If not a bootstrap validator, search Warp logs
    try {
        // Start from the latest block and search backwards in batches
        const latestBlock = await publicClient.getLogs({ fromBlock: 'latest' }).then(logs => logs.length > 0 ? logs[0].blockNumber : 0);
        const BATCH_SIZE = 2048;
        let fromBlock = BigInt(latestBlock);
        let toBlock = BigInt(latestBlock);
        let justification = null;

        console.log(`Starting search from latest block ${latestBlock} in batches of ${BATCH_SIZE} blocks...`);

        while (fromBlock > 0 && !justification) {
            // Calculate batch range
            fromBlock = BigInt(Math.max(0, Number(toBlock) - BATCH_SIZE + 1));

            console.log(`Searching for Warp logs in block range: ${fromBlock} to ${toBlock}...`);

            const warpLogs = await publicClient.getLogs({
                address: WARP_ADDRESS,
                event: sendWarpMessageEventAbi,
                fromBlock: fromBlock,
                toBlock: toBlock,
            });

            if (warpLogs.length > 0) {
                console.log(`Found ${warpLogs.length} Warp logs in block range ${fromBlock}-${toBlock}. Searching for justification matching ValidationID ${validationIDHex}...`);

                for (const log of warpLogs) {
                    try {
                        const decodedArgs = log.args as { message?: `0x${string}` };
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
                                    console.warn(`ValidationID match found (${validationIDHex}) in log ${log.transactionHash}, but NodeID in message (${utils.base58check.encode(Buffer.from(parsedPayload.nodeID))}) does not match expected NodeID ${nodeID}. Skipping.`);
                                    continue;
                                }

                                const tag = new Uint8Array([0x12]);
                                const lengthVarint = encodeVarint(payloadBytes.length);
                                const marshalledJustification = new Uint8Array(tag.length + lengthVarint.length + payloadBytes.length);
                                marshalledJustification.set(tag, 0);
                                marshalledJustification.set(lengthVarint, tag.length);
                                marshalledJustification.set(payloadBytes, tag.length + lengthVarint.length);

                                console.log(`Found matching ValidationID ${validationIDHex} (NodeID ${nodeID}) in Warp log (Tx: ${log.transactionHash}, Block: ${log.blockNumber}). Marshalled justification.`);
                                justification = marshalledJustification;
                                break; // Exit the loop once found
                            }
                        } catch (parseOrHashError) {
                            // console.warn(`Error parsing/hashing RegisterL1ValidatorMessage payload from Tx ${log.transactionHash}:`, parseOrHashError);
                        }
                    } catch (logProcessingError) {
                        console.error(`Error processing log entry for tx ${log.transactionHash}:`, logProcessingError);
                    }
                }
            } else {
                console.log(`No Warp logs found in block range ${fromBlock}-${toBlock}.`);
            }

            // If justification was found, break out of the while loop
            if (justification) break;

            // Move to previous batch
            toBlock = fromBlock - 1n;

            // Exit if we've scanned all blocks
            if (toBlock < 0) break;
        }

        if (!justification) {
            console.log(`No matching registration log found for ValidationID ${validationIDHex} in any Warp logs.`);
        }

        return justification;

    } catch (fetchLogError) {
        console.error(`Error fetching or decoding logs for ValidationID ${validationIDHex}:`, fetchLogError);
        return null;
    }
}

/**
 * Gets the registration message for a validator
 * @param rpcURL The RPC URL to connect to
 * @param validationID The validation ID
 * @param chain The Viem chain configuration
 * @returns The registration message
 */
export async function getRegistrationMessage(
    rpcURL: string,
    validationID: string,
    chain: Chain
): Promise<Hex | null> {
    // Check cache first
    if (registrationMessageCache[validationID]) {
        return `0x${Buffer.from(registrationMessageCache[validationID]).toString('hex')}` as Hex;
    }

    // Create a Viem public client with the provided chain configuration
    const client = createPublicClient({
        transport: http(rpcURL),
        chain: chain,
    });

    // Get current block height
    const height = await client.getBlockNumber();

    // Start from most recent blocks and work backwards all the way to block 0
    // const endBlock = Number(height);
    const endBlock = 38892305;
    // const startBlock = 0;
    const startBlock = 38892302;

    // SubnetEVM Warp contract address
    const subnetEvmWarpAddress = "0x0200000000000000000000000000000000000005"; // Replace with actual address

    console.log(`Looking for validationID in topics: ${validationID}`);

    // Search from most recent to oldest in batches
    for (let blockNumber = endBlock; blockNumber >= startBlock; blockNumber -= BatchSize) {
        // Calculate batch end and start
        const batchEnd = blockNumber;
        let batchStart = blockNumber - BatchSize + 1;
        if (batchStart < startBlock) {
            batchStart = startBlock;
        }

        console.log(`Searching blocks ${batchStart} to ${batchEnd} for validation ID ${validationID}`);

        try {
            // Query logs for all blocks in the batch using Viem
            const logs = await client.getLogs({
                address: subnetEvmWarpAddress,
                fromBlock: BigInt(batchStart),
                toBlock: BigInt(batchEnd),
            });

            console.log(`Found ${logs.length} logs in blocks ${batchStart} to ${batchEnd}`);

            // Process logs for this batch - simply check if topics[2] matches validationID
            for (const log of logs) {
                if (log.topics.length >= 3) {
                    console.log(`Comparing log topic: ${log.topics[2]} with validationID: ${validationID}`);

                    // Check if the third topic matches our validationID
                    if (log.topics[2] === validationID) {
                        console.log("Found matching log:", log);

                        // Cache the result before returning
                        registrationMessageCache[validationID] = hexToUint8Array(log.data);

                        return log.data;
                    }
                }
            }
        } catch (error) {
            console.error(`Error fetching logs for blocks ${batchStart}-${batchEnd}:`, error);
        }

        // Rate limit delay between batches
        await new Promise(resolve => setTimeout(resolve, RateLimitDelay));
    }

    return null;
}

// Helper functions
function appendToID(id: string, index: number): string {
    // Implementation would depend on how IDs are structured
    return `${id}-${index}`;
}

function stringToUint8Array(str: string): Uint8Array {
    return Buffer.from(str, 'hex');
}

function hexToUint8Array(hex: Hex): Uint8Array {
    // Remove '0x' prefix if present
    const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
    return Buffer.from(hexString, 'hex');
}

async function marshalProto(obj: L1ValidatorRegistrationJustification): Promise<Uint8Array> {
    // We'll use protobufjs for serialization
    const protobuf = require('protobufjs');

    // Define the Protocol Buffer message structure
    const root = protobuf.Root.fromJSON({
        nested: {
            L1ValidatorRegistrationJustification: {
                fields: {
                    preimage: {
                        type: "Preimage",
                        id: 1
                    }
                }
            },
            Preimage: {
                oneofs: {
                    content: {
                        oneof: ["convertSubnetToL1TxData", "registerL1ValidatorMessage"]
                    }
                },
                fields: {
                    convertSubnetToL1TxData: {
                        type: "ConvertSubnetToL1TxData",
                        id: 1
                    },
                    registerL1ValidatorMessage: {
                        type: "bytes",
                        id: 2
                    }
                }
            },
            ConvertSubnetToL1TxData: {
                fields: {
                    subnetId: {
                        type: "bytes",
                        id: 1
                    },
                    index: {
                        type: "uint32",
                        id: 2
                    }
                }
            }
        }
    });

    // Get the message type
    const L1ValidatorRegistrationJustificationType = root.lookupType("L1ValidatorRegistrationJustification");

    // Verify the payload
    const errMsg = L1ValidatorRegistrationJustificationType.verify(obj);
    if (errMsg) {
        throw new Error(`Invalid protocol buffer message: ${errMsg}`);
    }

    // Create the message
    const message = L1ValidatorRegistrationJustificationType.create(obj);

    // Encode the message to binary format
    return L1ValidatorRegistrationJustificationType.encode(message).finish();
}

export interface PChainOwner {
    threshold: number;
    addresses: `0x${string}`[];
}

export interface ValidationPeriod {
    subnetId: string;
    nodeID: string;
    blsPublicKey: `0x${string}`;
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
        validation.remainingBalanceOwner.addresses.push(addr as `0x${string}`);
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
        validation.disableOwner.addresses.push(addr as `0x${string}`);
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

function parseUint32(input: Uint8Array, offset: number): number {
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
