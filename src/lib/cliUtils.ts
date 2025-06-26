import { Argument } from '@commander-js/extra-typings';
import { utils } from "@avalabs/avalanchejs";
import { Hex, parseUnits } from 'viem';
import { NodeId } from './utils';

// Base validators

function isValidCB58(value: string): boolean {
  try {
    const decoded = utils.base58.decode(value);
    const embeddedCheck = decoded.slice(-4);
    const check = utils.addChecksum(decoded.slice(0, -4)).slice(-4);
    if (!check.every((v, i) => embeddedCheck[i] === v)) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

function isValidHex(hex: string, bytes?: number): boolean {
  const hexPattern = bytes ? new RegExp(`^0x([a-fA-F0-9]{${bytes * 2}})$`) : /^0x([a-fA-F0-9]{2})+$/;
  return hexPattern.test(hex);
}

// Parser (may be used by args or opts)

export const ParserHex = (value: string, bytes?: number, errorMsg?: string) => {
  if (!isValidHex(value, bytes)) {
    throw new Error(errorMsg ? errorMsg : 'Invalid Hex string');
  }
  return value as Hex;
};

export const ParserPrivateKey = (value: string) => ParserHex(value, 32, 'Invalid Private Key format. Private key must be a 32-byte Hex string');

export const ParserAddress = (value: string) => ParserHex(value, 20, 'Invalid Address format. Address must be a 20-byte Hex string');

export const ParserAVAX = (value: string) => {
  const avaxAmount = parseUnits(value, 9);
  if (isNaN(Number(avaxAmount))) {
    throw new Error('Invalid AVAX amount');
  }
  return avaxAmount;
}

export const ParserNumber = (value: string) => {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error('Invalid Number');
  }
  return num;
}

// Perhaps we need to check the node ID length ?
export const ParserNodeID = (value: string) => {
  if (!value.startsWith('NodeID-') || !isValidCB58(value.slice(7))) {
    throw new Error('Invalid NodeID (CB58)');
  }
  return value as NodeId;
}

// Argument exports

// Validate NodeID in CB58 format
export const ArgNodeID = (name?: string, description?: string) => new Argument(
  `<${name ? name : "nodeID"}>`,
  `${description ? description : "Node ID in CB58 format (e.g., NodeID-3J4k5L6m7N8o9P0Q1R2S3T4U5V6W7X8Y9Z0A1B2C)"}`
).argParser(ParserNodeID);

// Validate Hex strings
export const ArgHex = (name?: string, description?: string, bytes?: number, errorMsg?: string) => new Argument(
  `<${name ? name : "hex"}>`,
  `${description ? description : "Hex string (e.g., 0x1234567890abcdef1234567890abcdef12345678)"}`
).argParser((value) => ParserHex(value, bytes, errorMsg));

// Validate CB58 strings
export const ArgCB58 = (name?: string, description?: string) => new Argument(
  `<${name ? name : "cb58"}>`,
  `${description ? description : "CB58 string (e.g., 3J4k5L6m7N8o9P0Q1R2S3T4U5V6W7X8Y9Z0A1B2C)"}`
).argParser((value) => {
  if (!isValidCB58(value)) {
    throw new Error('Invalid CB58 string');
  }
  return value;
});

// Validate URI
export const ArgURI = (name?: string, description?: string) => new Argument(
  `<${name ? name : "URI"}>`,
  `${description ? description : "URI (e.g., https://example.com or wss://example.com)"}`
).argParser((value) => {
  if (!/^(https?|wss?):\/\/[^\s/$.?#].[^\s]*$/.test(value)) {
    throw new Error('Invalid URI');
  }
  return value;
});

// Validate Path
export const ArgPath = (name?: string, description?: string) => new Argument(
  `<${name ? name : "path"}>`,
  `${description ? description : "Path (e.g., /path/to/resource)"}`
).argParser((value) => {
  if (!/^\/[a-zA-Z0-9_\-\/]*$/.test(value)) {
    throw new Error('Invalid Path');
  }
  return value;
});

// Validate Number
export const ArgNumber = (name?: string, description?: string) => new Argument(
  `<${name ? name : "number"}>`,
  `${description ? description : "Number (e.g., 12345)"}`
).argParser(ParserNumber);

// Validate BigInt
export const ArgBigInt = (name?: string, description?: string) => new Argument(
  `<${name ? name : "bigint"}>`,
  `${description ? description : "BigInt (e.g., 1234567890123456789)"}`
).argParser((value) => {
  const bigIntValue = BigInt(value);
  if (isNaN(Number(bigIntValue))) {
    throw new Error('Invalid BigInt');
  }
  return bigIntValue;
});

// Validate AVAX amount
export const ArgAVAX = (name?: string, description?: string, errorMsg?: string) => new Argument(
  `<${name ? name : "AVAX"}>`,
  `${description ? description : "AVAX amount in number format (e.g., 0.8)"}`
).argParser(ParserAVAX);

// Predefined arguments for common use cases

// Address argument
export const ArgAddress = (name?: string, description?: string) => ArgHex(
  name || 'address',
  description || 'Ethereum address in Hex format',
  20,
  'Invalid address format. Address must be a 20-byte Hex string'
)

// Private key argument
export const ArgPrivateKey = (name?: string, description?: string) => ArgHex(
  name || 'privateKey',
  description || 'Private key in Hex format',
  32,
  'Invalid private key format. Private key must be a 32-byte Hex string'
)

// BLS Public key argument
export const ArgBLSPublicKey = (name?: string, description?: string) => ArgHex(
  name || 'blsPublicKey',
  description || 'BLS Public key in Hex format',
  48,
  'Invalid BLS Public key format. BLS Public key must be a 48-byte Hex string'
);

// BLS Proof of Possession argument
export const ArgBLSPOP = (name?: string, description?: string) => ArgHex(
  name || 'blsProofOfPossession',
  description || 'BLS Proof of Possession in Hex format',
  96,
  'Invalid BLS Proof of Possession format. BLS POP must be a 96-byte Hex string'
);
