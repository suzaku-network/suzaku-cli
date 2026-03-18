import { pvm, Context, utils } from "@avalabs/avalanchejs"
import type { Hex } from "viem"
import type { Network } from "../types"
import type { PChainSigner, SignerDebugLog } from "./signer"
import { getPChainBaseUrl } from "./client"
import { uint8ArrayToHex, bytesToCB58 } from "../utils/encoding"

export interface RegisterL1ValidatorParams {
  network: Network
  pChainSigner: PChainSigner
  blsProofOfPossession: string
  signedMessage: string
  initialBalance: bigint
  debug?: SignerDebugLog
}

/**
 * Builds a RegisterL1Validator P-Chain transaction, signs it via the PChainSigner
 * (Core wallet), and submits it to the P-Chain.
 */
export const registerL1Validator = async (
  params: RegisterL1ValidatorParams,
): Promise<Hex> => {
  const debug = params.debug ?? (() => {})

  const rpcUrl = getPChainBaseUrl(params.network)
  debug("registerL1Validator:rpcUrl", rpcUrl)

  debug("registerL1Validator:fetchingFeeState")
  const pvmApi = new pvm.PVMApi(rpcUrl)
  const feeState = await pvmApi.getFeeState()
  debug("registerL1Validator:feeState", feeState)

  debug("registerL1Validator:fetchingContext")
  const context = await Context.getContextFromURI(rpcUrl)
  debug("registerL1Validator:contextReady")

  const pChainAddress = params.pChainSigner.pChainAddress
  debug("registerL1Validator:pChainAddress", pChainAddress)

  const addressBytes = utils.bech32ToBytes(pChainAddress)
  debug("registerL1Validator:addressBytes", { length: addressBytes.length })

  debug("registerL1Validator:fetchingUTXOs", { address: pChainAddress })
  const { utxos } = await pvmApi.getUTXOs({
    addresses: [pChainAddress],
  })
  debug("registerL1Validator:utxos", {
    count: utxos.length,
    ids: utxos.map((utxo) => utxo.ID()),
  })

  if (utxos.length === 0) {
    throw new Error(
      `No UTXOs found for P-Chain address ${pChainAddress}. ` +
      `The account needs AVAX on the P-Chain to pay for the registration transaction.`,
    )
  }

  const blsPoPHex = params.blsProofOfPossession.startsWith("0x")
    ? params.blsProofOfPossession.slice(2)
    : params.blsProofOfPossession

  const signedMsgHex = params.signedMessage.startsWith("0x")
    ? params.signedMessage.slice(2)
    : params.signedMessage

  debug("registerL1Validator:buildingTx", {
    balance: params.initialBalance.toString(),
    blsSignatureLength: blsPoPHex.length,
    messageLength: signedMsgHex.length,
  })

  const tx = pvm.e.newRegisterL1ValidatorTx(
    {
      balance: params.initialBalance,
      blsSignature: hexStringToUint8Array(blsPoPHex),
      message: hexStringToUint8Array(signedMsgHex),
      feeState,
      fromAddressesBytes: [addressBytes],
      utxos,
    },
    context,
  )

  const unsignedBytes = tx.toBytes()
  const unsignedHex = uint8ArrayToHex(unsignedBytes).slice(2)
  debug("registerL1Validator:unsignedTx", {
    byteLength: unsignedBytes.length,
    hexLength: unsignedHex.length,
    hexPreview: unsignedHex.slice(0, 40) + "...",
  })

  const utxoIds = utxos.map((utxo) => utxo.ID())
  debug("registerL1Validator:signingTx", { utxoIds })

  const { signedTransactionHex } = await params.pChainSigner.signTransaction(
    unsignedHex,
    utxoIds,
  )
  debug("registerL1Validator:txSigned", {
    signedHexLength: signedTransactionHex.length,
  })

  const txHex = signedTransactionHex.startsWith("0x")
    ? signedTransactionHex
    : `0x${signedTransactionHex}`

  debug("registerL1Validator:issuingTx", { txHexLength: txHex.length })
  const response = await pvmApi.issueTx({ tx: txHex })
  const txID = response.txID as Hex
  debug("registerL1Validator:issued", { txID })

  debug("registerL1Validator:waitingForCommit", { txID })
  await waitPChainTx(txID, pvmApi, debug)
  debug("registerL1Validator:committed", { txID })

  return txID
}

const hexStringToUint8Array = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

const waitPChainTx = async (
  txID: string,
  pvmApi: pvm.PVMApi,
  debug: SignerDebugLog = () => {},
  pollingInterval = 3000,
  retryCount = 10,
): Promise<void> => {
  let response = await pvmApi.getTxStatus({ txID })
  debug("waitPChainTx:status", { txID, status: response.status, attempt: 0 })

  let retry = 0
  while (response.status !== "Committed" && retry < retryCount) {
    await new Promise((resolve) => setTimeout(resolve, pollingInterval))
    response = await pvmApi.getTxStatus({ txID })
    retry++
    debug("waitPChainTx:status", { txID, status: response.status, attempt: retry })
  }

  if (response.status !== "Committed") {
    throw new Error(
      `P-Chain transaction ${txID} not committed after ${retryCount} retries. Last status: ${response.status}`,
    )
  }
}
