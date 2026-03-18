import { fromBytes, Hex, pad } from "viem"
import { utils } from "@avalabs/avalanchejs"
import { base58 } from "@scure/base"
import { sha256 } from "@noble/hashes/sha256"
import type { NodeId } from "../types"

const CHECKSUM_LENGTH = 4

export const hexToUint8Array = (hex: Hex): Uint8Array => {
  const hexString = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16)
  }
  return bytes
}

export const uint8ArrayToHex = (bytes: Uint8Array): Hex => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `0x${hex}`
}

export const cb58ToBytes = (cb58: string): Uint8Array => {
  const decodedBytes = base58.decode(cb58)
  if (decodedBytes.length < CHECKSUM_LENGTH) {
    throw new Error("Input string is smaller than the checksum size")
  }
  return decodedBytes.slice(0, -CHECKSUM_LENGTH)
}

export const cb58ToHex = (cb58: string): Hex => {
  const rawBytes = cb58ToBytes(cb58)
  const hex = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  const paddedHex = hex.padStart(64, "0")
  return `0x${paddedHex}` as Hex
}

export const bytesToCB58 = (bytes: Uint8Array): string => {
  const checksum = sha256(bytes).slice(0, 4)
  const withChecksum = new Uint8Array(bytes.length + 4)
  withChecksum.set(bytes)
  withChecksum.set(checksum, bytes.length)
  return base58.encode(withChecksum)
}

export const parseNodeID = (nodeID: NodeId, padding = true): Hex => {
  const nodeIDWithoutPrefix = nodeID.replace("NodeID-", "")
  const decodedID = utils.base58.decode(nodeIDWithoutPrefix)
  const nodeIDHex = fromBytes(decodedID, "hex")
  const nodeIDHexTrimmed = nodeIDHex.slice(0, -8)
  return padding
    ? (pad(nodeIDHexTrimmed as Hex, { size: 32 }) as Hex)
    : (nodeIDHexTrimmed as Hex)
}

export const encodeNodeID = (nodeIDBytes: Hex): NodeId => {
  let nodeU8Array = hexToUint8Array(nodeIDBytes)
  nodeU8Array =
    nodeU8Array.length === 32 ? nodeU8Array.slice(12) : nodeU8Array
  const nodeId = `NodeID-${utils.base58check.encode(nodeU8Array)}`
  return nodeId as NodeId
}
