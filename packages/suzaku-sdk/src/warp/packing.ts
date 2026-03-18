import type { Hex } from "viem"
import { cb58ToBytes } from "../utils/encoding"

const codecVersion = 0

const encodeUint16 = (num: number): Uint8Array => encodeNumber(num, 2)
const encodeUint32 = (num: number): Uint8Array => encodeNumber(num, 4)
const encodeUint64 = (num: bigint): Uint8Array => encodeNumber(num, 8)

const encodeNumber = (num: number | bigint, numberBytes: number): Uint8Array => {
  const arr = new Uint8Array(numberBytes)
  let value = typeof num === "bigint" ? num : BigInt(num)
  for (let i = numberBytes - 1; i >= 0; i--) {
    arr[i] = Number(value & 0xffn)
    value = value >> 8n
  }
  return arr
}

const concatenateUint8Arrays = (...arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

const newAddressedCall = (
  sourceAddress: Uint8Array,
  payload: Uint8Array,
): Uint8Array => {
  const encodeVarBytes = (bytes: Uint8Array): Uint8Array => {
    const lengthBytes = encodeUint32(bytes.length)
    const result = new Uint8Array(lengthBytes.length + bytes.length)
    result.set(lengthBytes)
    result.set(bytes, lengthBytes.length)
    return result
  }

  return concatenateUint8Arrays(
    encodeUint16(codecVersion),
    encodeUint32(1),
    encodeVarBytes(sourceAddress),
    encodeVarBytes(payload),
  )
}

const newUnsignedMessage = (
  networkID: number,
  sourceChainID: string,
  message: Uint8Array,
): Uint8Array =>
  concatenateUint8Arrays(
    encodeUint16(codecVersion),
    encodeUint32(networkID),
    cb58ToBytes(sourceChainID),
    encodeUint32(message.length),
    message,
  )

export const packL1ValidatorRegistration = (
  validationID: Uint8Array,
  registered: boolean,
  networkID: number,
  sourceChainID: string,
): Uint8Array => {
  if (validationID.length !== 32) {
    throw new Error("ValidationID must be exactly 32 bytes")
  }

  const messagePayload = concatenateUint8Arrays(
    encodeUint16(codecVersion),
    encodeUint32(2), // L1_VALIDATOR_REGISTRATION_MESSAGE_TYPE_ID
    validationID,
    new Uint8Array([registered ? 1 : 0]),
  )

  const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload)
  return newUnsignedMessage(networkID, sourceChainID, addressedCall)
}

const L1_VALIDATOR_WEIGHT_MESSAGE_TYPE_ID = 3
const VALIDATION_UPTIME_MESSAGE_TYPE_ID = 0

export const packL1ValidatorWeightMessage = (
  validationID: Uint8Array,
  nonce: bigint,
  weight: bigint,
  networkID: number,
  sourceChainID: string,
): Uint8Array => {
  if (validationID.length !== 32) {
    throw new Error("ValidationID must be exactly 32 bytes")
  }

  const messagePayload = concatenateUint8Arrays(
    encodeUint16(codecVersion),
    encodeUint32(L1_VALIDATOR_WEIGHT_MESSAGE_TYPE_ID),
    validationID,
    encodeUint64(nonce),
    encodeUint64(weight),
  )

  const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload)
  return newUnsignedMessage(networkID, sourceChainID, addressedCall)
}

export const packValidationUptimeMessage = (
  validationID: Uint8Array,
  uptimeSeconds: number,
  networkID: number,
  sourceChainID: string,
): Uint8Array => {
  if (validationID.length !== 32) {
    throw new Error("ValidationID must be exactly 32 bytes")
  }

  const messagePayload = concatenateUint8Arrays(
    encodeUint16(codecVersion),
    encodeUint32(VALIDATION_UPTIME_MESSAGE_TYPE_ID),
    validationID,
    encodeUint64(BigInt(uptimeSeconds)),
  )

  const addressedCall = newAddressedCall(new Uint8Array([]), messagePayload)
  return newUnsignedMessage(networkID, sourceChainID, addressedCall)
}

export const packWarpIntoAccessList = (
  warpMessageBytes: Uint8Array,
): [{ address: Hex; storageKeys: Hex[] }] => {
  const CHUNK_SIZE = 32
  const chunks: string[] = []
  const currentChunk = Array.from(warpMessageBytes)

  currentChunk.push(0xff)

  const paddingNeeded =
    (CHUNK_SIZE - (currentChunk.length % CHUNK_SIZE)) % CHUNK_SIZE
  for (let i = 0; i < paddingNeeded; i++) {
    currentChunk.push(0)
  }

  for (let i = 0; i < currentChunk.length; i += CHUNK_SIZE) {
    const chunk = currentChunk.slice(i, i + CHUNK_SIZE)
    const hexChunk = chunk.map((byte) => byte.toString(16).padStart(2, "0")).join("")
    chunks.push(`0x${hexChunk}`)
  }

  return [
    {
      address: "0x0200000000000000000000000000000000000005" as Hex,
      storageKeys: chunks as Hex[],
    },
  ]
}
