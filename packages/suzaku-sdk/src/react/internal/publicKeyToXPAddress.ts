import { secp256k1, utils } from "@avalabs/avalanchejs";
import { ProjectivePoint as Point } from "@noble/secp256k1";

export type XPAddress = `0x${string}` | string;

/**
 * Derives an XP bech32 address from a hex-encoded secp256k1 public key.
 *
 * Vendored from `@avalanche-sdk/client/accounts` (whose barrel imports
 * `node:crypto`, breaking browser bundlers). Implementation is identical:
 * decode → compress → hash → bech32.
 */
export function publicKeyToXPAddress(publicKey: string, hrp: string): XPAddress {
  const point = Point.fromHex(utils.strip0x(publicKey));
  const compressedPubKey = new Uint8Array(point.toRawBytes(true));
  const address = secp256k1.publicKeyBytesToAddress(compressedPubKey);
  return utils.formatBech32(hrp, address) as XPAddress;
}
