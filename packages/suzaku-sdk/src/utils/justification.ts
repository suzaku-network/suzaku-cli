import { parseAbiItem, hexToBytes, type Hex, type PublicClient, type Transport, type Chain } from "viem"
import { utils } from "@avalabs/avalanchejs"
import { sha256 } from "@noble/hashes/sha256"

const REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID = 1
const NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH = 100
const WARP_ADDRESS = "0x0200000000000000000000000000000000000005" as const
const BATCH_SIZE = 2048

const sendWarpMessageEventAbi = parseAbiItem(
  "event SendWarpMessage(address indexed sourceAddress, bytes32 indexed unsignedMessageID, bytes message)",
)

// --- Byte helpers ---

const encodeVarint = (value: number): Uint8Array => {
  const bytes: number[] = []
  let v = value
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)
  return new Uint8Array(bytes)
}

const uint32ToBE = (value: number): Uint8Array => {
  const buf = new Uint8Array(4)
  buf[0] = (value >>> 24) & 0xff
  buf[1] = (value >>> 16) & 0xff
  buf[2] = (value >>> 8) & 0xff
  buf[3] = value & 0xff
  return buf
}

const parseUint16 = (input: Uint8Array, offset: number): number =>
  (input[offset] << 8) | input[offset + 1]

const parseUint32 = (input: Uint8Array, offset: number): number =>
  (input[offset] << 24) | (input[offset + 1] << 16) | (input[offset + 2] << 8) | input[offset + 3]

const parseUint64 = (input: Uint8Array, offset: number): bigint => {
  let result = 0n
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(input[offset + i])
  }
  return result
}

const compareBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const concat = (...arrays: Uint8Array[]): Uint8Array => {
  const total = arrays.reduce((acc, a) => acc + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

const encodeUint16 = (num: number): Uint8Array => new Uint8Array([(num >>> 8) & 0xff, num & 0xff])

const encodeUint32BE = (num: number): Uint8Array => uint32ToBE(num)

const encodeUint64BE = (num: bigint): Uint8Array => {
  const buf = new Uint8Array(8)
  let v = num
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return buf
}

// --- Validation period types ---

interface PChainOwnerRaw {
  threshold: number
  addresses: Uint8Array[]
}

interface SolidityValidationPeriod {
  subnetID: Uint8Array
  nodeID: Uint8Array
  blsPublicKey: Uint8Array
  registrationExpiry: bigint
  remainingBalanceOwner: PChainOwnerRaw
  disableOwner: PChainOwnerRaw
  weight: bigint
}

// --- Pack / unpack ---

const packRegisterL1ValidatorPayload = (vp: SolidityValidationPeriod): Uint8Array => {
  const parts: Uint8Array[] = [
    encodeUint16(0),
    encodeUint32BE(REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID),
    vp.subnetID,
    encodeUint32BE(vp.nodeID.length),
    vp.nodeID,
    vp.blsPublicKey,
    encodeUint64BE(vp.registrationExpiry),
    encodeUint32BE(vp.remainingBalanceOwner.threshold),
    encodeUint32BE(vp.remainingBalanceOwner.addresses.length),
    ...vp.remainingBalanceOwner.addresses,
    encodeUint32BE(vp.disableOwner.threshold),
    encodeUint32BE(vp.disableOwner.addresses.length),
    ...vp.disableOwner.addresses,
    encodeUint64BE(vp.weight),
  ]
  return concat(...parts)
}

const unpackRegisterL1ValidatorPayload = (input: Uint8Array): SolidityValidationPeriod => {
  let idx = 0

  const codecID = parseUint16(input, idx); idx += 2
  if (codecID !== 0) throw new Error(`Invalid codec ID: ${codecID}`)

  const typeID = parseUint32(input, idx); idx += 4
  if (typeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID) throw new Error(`Invalid type: ${typeID}`)

  const subnetID = input.slice(idx, idx + 32); idx += 32

  const nodeIDLen = parseUint32(input, idx); idx += 4
  const nodeID = input.slice(idx, idx + nodeIDLen); idx += nodeIDLen

  const blsPublicKey = input.slice(idx, idx + 48); idx += 48
  const registrationExpiry = parseUint64(input, idx); idx += 8

  const rboThreshold = parseUint32(input, idx); idx += 4
  const rboAddrCount = parseUint32(input, idx); idx += 4
  const rboAddresses: Uint8Array[] = []
  for (let i = 0; i < rboAddrCount; i++) {
    rboAddresses.push(input.slice(idx, idx + 20)); idx += 20
  }

  const doThreshold = parseUint32(input, idx); idx += 4
  const doAddrCount = parseUint32(input, idx); idx += 4
  const doAddresses: Uint8Array[] = []
  for (let i = 0; i < doAddrCount; i++) {
    doAddresses.push(input.slice(idx, idx + 20)); idx += 20
  }

  const weight = parseUint64(input, idx)

  return {
    subnetID, nodeID, blsPublicKey, registrationExpiry,
    remainingBalanceOwner: { threshold: rboThreshold, addresses: rboAddresses },
    disableOwner: { threshold: doThreshold, addresses: doAddresses },
    weight,
  }
}

// --- Warp message parsing ---

const extractAddressedCall = (messageBytes: Uint8Array): Uint8Array => {
  if (messageBytes.length < 42) return new Uint8Array()
  const msgLen = parseUint32(messageBytes, 38)
  if (msgLen <= 0 || 42 + msgLen > messageBytes.length) return new Uint8Array()
  return messageBytes.slice(42, 42 + msgLen)
}

const extractPayloadFromAddressedCall = (ac: Uint8Array): Uint8Array | null => {
  if (ac.length < 10) return null
  const srcAddrLen = parseUint32(ac, 6)
  const payloadLenPos = 10 + srcAddrLen
  if (payloadLenPos + 4 > ac.length) return null
  const payloadLen = parseUint32(ac, payloadLenPos)
  if (payloadLen <= 0) return null
  const start = payloadLenPos + 4
  if (start + payloadLen > ac.length) return null
  return ac.slice(start, start + payloadLen)
}

// --- Justification marshalling ---

const marshalBootstrapJustification = (subnetIDBytes: Uint8Array, index: number): Uint8Array => {
  const subnetIdTag = new Uint8Array([0x0a])
  const subnetIdLen = encodeVarint(subnetIDBytes.length)
  const indexTag = new Uint8Array([0x10])
  const indexVarint = encodeVarint(index)

  const inner = concat(subnetIdTag, subnetIdLen, subnetIDBytes, indexTag, indexVarint)
  const outerTag = new Uint8Array([0x0a])
  const outerLen = encodeVarint(inner.length)
  return concat(outerTag, outerLen, inner)
}

const marshalWarpLogJustification = (payloadBytes: Uint8Array): Uint8Array => {
  const tag = new Uint8Array([0x12])
  const lengthVarint = encodeVarint(payloadBytes.length)
  return concat(tag, lengthVarint, payloadBytes)
}

// --- Main export ---

/**
 * Finds the L1ValidatorRegistrationJustification for a given validationID.
 *
 * Checks bootstrap validators first, then searches Warp logs backwards from
 * `startBlock` for the original RegisterL1ValidatorMessage whose hash matches.
 *
 * Browser-safe: no Buffer, no Node APIs.
 */
export const getRegistrationJustification = async (
  params: {
    nodeId: string
    validationID: Hex
    subnetID: string
    publicClient: PublicClient<Transport, Chain>
    startBlock?: bigint
  },
): Promise<Hex> => {
  const { nodeId, validationID, subnetID, publicClient, startBlock } = params

  const targetValidationIDBytes = hexToBytes(validationID)
  if (targetValidationIDBytes.length !== 32) {
    throw new Error(`validationID must be 32 bytes, got ${targetValidationIDBytes.length}`)
  }

  const subnetIDBytes = utils.base58check.decode(subnetID)

  let targetNodeIDBytes: Uint8Array | null = null
  if (nodeId.startsWith("NodeID-")) {
    try {
      targetNodeIDBytes = utils.base58check.decode(nodeId.substring(7))
    } catch { /* optional confirmation */ }
  }

  // 1. Check bootstrap validators
  for (let index = 0; index < NUM_BOOTSTRAP_VALIDATORS_TO_SEARCH; index++) {
    const derived = concat(subnetIDBytes, uint32ToBE(index))
    const hash = sha256(derived)
    if (compareBytes(hash, targetValidationIDBytes)) {
      const justBytes = marshalBootstrapJustification(subnetIDBytes, index)
      return `0x${Array.from(justBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex
    }
  }

  // 2. Search Warp logs backwards
  const latestBlock = startBlock ?? await publicClient.getBlockNumber()
  let toBlock = latestBlock

  while (toBlock > 0n) {
    const fromBlock = BigInt(Math.max(0, Number(toBlock) - BATCH_SIZE + 1))

    const warpLogs = await publicClient.getLogs({
      address: WARP_ADDRESS,
      event: sendWarpMessageEventAbi,
      fromBlock,
      toBlock,
    })

    for (const log of warpLogs) {
      try {
        const fullMsgHex = (log.args as { message?: Hex }).message
        if (!fullMsgHex) continue

        const msgBytes = hexToBytes(fullMsgHex)
        const ac = extractAddressedCall(msgBytes)
        if (ac.length < 6) continue

        const acTypeID = parseUint32(ac, 2)
        if (acTypeID !== REGISTER_L1_VALIDATOR_MESSAGE_TYPE_ID) continue

        const payloadBytes = extractPayloadFromAddressedCall(ac)
        if (!payloadBytes) continue

        const parsed = unpackRegisterL1ValidatorPayload(payloadBytes)
        const logValidationIDBytes = sha256(packRegisterL1ValidatorPayload(parsed))

        if (!compareBytes(logValidationIDBytes, targetValidationIDBytes)) continue

        if (targetNodeIDBytes && !compareBytes(parsed.nodeID, targetNodeIDBytes)) continue

        const justBytes = marshalWarpLogJustification(payloadBytes)
        return `0x${Array.from(justBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex
      } catch {
        // skip unparseable logs
      }
    }

    toBlock = fromBlock - 1n
    if (toBlock < 0n) break
  }

  throw new Error(
    `Registration justification not found for validationID ${validationID}. ` +
    `Searched bootstrap indices and Warp logs from block ${latestBlock} to 0.`,
  )
}
