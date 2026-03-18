import { pvm, Context, utils } from "@avalabs/avalanchejs"
import type { Hex } from "viem"
import type { Network } from "../types"
import type { PChainSigner, SignerDebugLog } from "./signer"
import { getPChainBaseUrl } from "./client"
import { hexToUint8Array, uint8ArrayToHex } from "../utils/encoding"

export interface SetValidatorWeightParams {
  network: Network
  pChainSigner: PChainSigner
  signedMessage: string
  debug?: SignerDebugLog
}

/**
 * Builds a SetL1ValidatorWeight P-Chain transaction (weight=0 for removal),
 * signs it via the PChainSigner (Core wallet), and submits it to the P-Chain.
 */
export const setValidatorWeight = async (
  params: SetValidatorWeightParams,
): Promise<Hex> => {
  const debug = params.debug ?? (() => {})

  const rpcUrl = getPChainBaseUrl(params.network)
  debug("setValidatorWeight:rpcUrl", rpcUrl)

  const pvmApi = new pvm.PVMApi(rpcUrl)
  const feeState = await pvmApi.getFeeState()
  const context = await Context.getContextFromURI(rpcUrl)

  const pChainAddress = params.pChainSigner.pChainAddress
  const addressBytes = utils.bech32ToBytes(pChainAddress)

  debug("setValidatorWeight:fetchingUTXOs", { address: pChainAddress })
  const { utxos } = await pvmApi.getUTXOs({
    addresses: [pChainAddress],
  })
  debug("setValidatorWeight:utxos", {
    count: utxos.length,
    ids: utxos.map((utxo) => utxo.ID()),
  })

  if (utxos.length === 0) {
    throw new Error(
      `No UTXOs found for P-Chain address ${pChainAddress}. ` +
      `The account needs AVAX on the P-Chain to pay for the transaction.`,
    )
  }

  const msgHex = params.signedMessage.startsWith("0x")
    ? params.signedMessage.slice(2)
    : params.signedMessage

  debug("setValidatorWeight:buildingTx", { messageLength: msgHex.length })

  const tx = pvm.e.newSetL1ValidatorWeightTx(
    {
      feeState,
      fromAddressesBytes: [addressBytes],
      message: hexToUint8Array(`0x${msgHex}`),
      utxos,
    },
    context,
  )

  const unsignedBytes = tx.toBytes()
  const unsignedHex = uint8ArrayToHex(unsignedBytes).slice(2)
  debug("setValidatorWeight:unsignedTx", { byteLength: unsignedBytes.length })

  const utxoIds = utxos.map((utxo) => utxo.ID())

  const { signedTransactionHex } = await params.pChainSigner.signTransaction(
    unsignedHex,
    utxoIds,
  )

  const txHex = signedTransactionHex.startsWith("0x")
    ? signedTransactionHex
    : `0x${signedTransactionHex}`

  debug("setValidatorWeight:issuingTx")
  const response = await pvmApi.issueTx({ tx: txHex })
  const txID = response.txID as Hex
  debug("setValidatorWeight:issued", { txID })

  debug("setValidatorWeight:waitingForCommit", { txID })
  await waitPChainTx(txID, pvmApi, debug)
  debug("setValidatorWeight:committed", { txID })

  return txID
}

const waitPChainTx = async (
  txID: string,
  pvmApi: pvm.PVMApi,
  debug: SignerDebugLog = () => {},
  pollingInterval = 3000,
  retryCount = 10,
): Promise<void> => {
  let response = await pvmApi.getTxStatus({ txID })
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
