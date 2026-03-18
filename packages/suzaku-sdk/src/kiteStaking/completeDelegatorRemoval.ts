import {
  type Hex,
  parseEventLogs,
  hexToBytes,
  bytesToHex,
  getContract,
} from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { ValidatorManagerABI } from "../abis/ValidatorManager"
import { IWarpMessengerABI } from "../abis/IWarpMessenger"
import { createSdkContract } from "../contracts/createContract"
import { encodeNodeID } from "../utils/encoding"
import { resolveFromVault } from "../utils/resolveAddresses"
import { getSigningSubnetIdFromWarpMessage } from "../pchain/client"
import { setValidatorWeight } from "../pchain/setValidatorWeight"
import { collectSignatures } from "../warp/collectSignatures"
import {
  packL1ValidatorWeightMessage,
  packWarpIntoAccessList,
} from "../warp/packing"
import { P_CHAIN_CHAIN_ID, NETWORK_IDS } from "../types"
import type { NodeId } from "../types"
import type {
  CompleteDelegatorRemovalParams,
  ParseDelegatorRemovalReceiptParams,
  DelegatorRemovalReceiptData,
  CollectDelegatorRemovalWarpSignaturesParams,
  SubmitCompleteDelegatorRemovalParams,
} from "./types"

// ---------------------------------------------------------------------------
// Step 1: Parse the initiate delegator removal receipt
// ---------------------------------------------------------------------------

export const parseDelegatorRemovalReceipt = async (
  params: ParseDelegatorRemovalReceiptParams,
): Promise<DelegatorRemovalReceiptData> => {
  const { publicClient, network, stakingVaultAddress, initiateRemovalTxHash } = params

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: initiateRemovalTxHash,
  })

  if (receipt.status === "reverted") {
    throw new Error(
      `[parseDelegatorRemovalReceipt] Transaction ${initiateRemovalTxHash} reverted.`,
    )
  }

  const vaultEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: "StakingVault__DelegatorRemovalInitiated",
  })

  if (vaultEvents.length === 0) {
    throw new Error(
      `[parseDelegatorRemovalReceipt] No StakingVault__DelegatorRemovalInitiated event in tx ${initiateRemovalTxHash}.`,
    )
  }

  const delegationID = vaultEvents[0].args.delegationID as Hex

  const { validatorManagerAddress } = await resolveFromVault(stakingVaultAddress, publicClient)

  const weightUpdateEvents = parseEventLogs({
    abi: ValidatorManagerABI,
    logs: receipt.logs,
    eventName: "InitiatedValidatorWeightUpdate",
  })

  if (weightUpdateEvents.length === 0) {
    throw new Error(
      `[parseDelegatorRemovalReceipt] No InitiatedValidatorWeightUpdate event in tx ${initiateRemovalTxHash}.`,
    )
  }

  const weightUpdateEvent = weightUpdateEvents[0]
  const validationID = weightUpdateEvent.args.validationID as Hex
  const validatorWeight = BigInt(weightUpdateEvent.args.weight)
  const nonce = BigInt(weightUpdateEvent.args.nonce)
  const setWeightMessageID = weightUpdateEvent.args.weightUpdateMessageID as Hex

  const validatorManagerContract = getContract({
    abi: ValidatorManagerABI,
    address: validatorManagerAddress,
    client: publicClient,
  })

  const validator = await validatorManagerContract.read.getValidator([validationID])
  const nodeId = encodeNodeID(validator.nodeID as Hex) as NodeId

  const warpLogs = parseEventLogs({
    abi: IWarpMessengerABI,
    logs: receipt.logs,
  })

  const warpLog = warpLogs.find(
    (w) => w.args.messageID === setWeightMessageID,
  )

  if (!warpLog) {
    throw new Error(
      `[parseDelegatorRemovalReceipt] No warp log matching weightUpdateMessageID ${setWeightMessageID}.`,
    )
  }

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(
    network,
    warpLog.args.message,
  )

  return {
    delegationID,
    validationID,
    nodeId,
    validatorWeight,
    nonce,
    setWeightMessageID,
    validatorManagerAddress,
    warpMessage: warpLog.args.message as Hex,
    signingSubnetId,
  }
}

// ---------------------------------------------------------------------------
// Step 2: Set validator weight on P-Chain (decreased weight)
// ---------------------------------------------------------------------------

export const setDelegatorRemovalWeightOnPChain = async (
  params: {
    network: Parameters<typeof collectSignatures>[0]["network"]
    pChainSigner: Parameters<typeof setValidatorWeight>[0]["pChainSigner"]
    warpMessage: Hex
    signingSubnetId: string
    glacierUrl?: string
    debug?: Parameters<typeof setValidatorWeight>[0]["debug"]
  },
): Promise<Hex> => {
  const { network, pChainSigner, warpMessage, signingSubnetId, glacierUrl, debug } = params

  const signedMessage = await collectSignatures({
    network,
    message: warpMessage,
    signingSubnetId,
    glacierUrl,
  })

  const txId = await setValidatorWeight({
    network,
    pChainSigner,
    signedMessage,
    debug,
  })

  return txId
}

// ---------------------------------------------------------------------------
// Step 3: Collect P-Chain weight confirmation signatures
// Uses the unsigned P-Chain warp message as justification
// ---------------------------------------------------------------------------

export const collectDelegatorRemovalWarpSignatures = async (
  params: CollectDelegatorRemovalWarpSignaturesParams,
): Promise<string> => {
  const {
    network,
    validationID,
    nonce,
    validatorWeight,
    signingSubnetId,
    glacierUrl,
  } = params

  const validationIDBytes = hexToBytes(validationID)
  const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(
    validationIDBytes,
    nonce,
    validatorWeight,
    NETWORK_IDS[network],
    P_CHAIN_CHAIN_ID,
  )
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg)

  const signedPChainMessage = await collectSignatures({
    network,
    message: unsignedPChainWarpMsgHex,
    justification: unsignedPChainWarpMsgHex,
    signingSubnetId,
    glacierUrl,
  })

  return signedPChainMessage
}

// ---------------------------------------------------------------------------
// Step 4: Submit completeDelegatorRemoval on C-Chain
// ---------------------------------------------------------------------------

export const submitCompleteDelegatorRemoval = async (
  params: SubmitCompleteDelegatorRemovalParams,
): Promise<Hex> => {
  const { walletClient, publicClient, stakingVaultAddress, delegationID, signedPChainWarpMessage } = params

  const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainWarpMessage}`)
  const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes)

  const messageIndex = 0

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await contract.safeWrite.completeDelegatorRemoval(
    [delegationID, messageIndex],
    { accessList },
  )

  return hash
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export const completeDelegatorRemoval = async (
  params: CompleteDelegatorRemovalParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    network,
    stakingVaultAddress,
    initiateRemovalTxHash,
    pChainSigner,
    glacierUrl,
    onProgress,
    debug,
  } = params

  const progress = onProgress ?? (() => {})

  // --- Step 1 ---
  progress("Step 1/4: Parsing initiate delegator removal receipt...")
  let receiptData: DelegatorRemovalReceiptData
  try {
    receiptData = await parseDelegatorRemovalReceipt({
      publicClient,
      network,
      stakingVaultAddress,
      initiateRemovalTxHash,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRemoval] Step 1 failed — parseDelegatorRemovalReceipt: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(
    `Step 1/4: Done. delegationID=${receiptData.delegationID}, validationID=${receiptData.validationID}, nodeId=${receiptData.nodeId}`,
  )

  // --- Step 2 ---
  progress("Step 2/4: Setting validator weight on P-Chain (wallet will prompt)...")
  try {
    const pChainTxId = await setDelegatorRemovalWeightOnPChain({
      network,
      pChainSigner,
      warpMessage: receiptData.warpMessage,
      signingSubnetId: receiptData.signingSubnetId,
      glacierUrl,
      debug,
    })
    progress(`Step 2/4: Done. P-Chain txID=${pChainTxId}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes("stale nonce")) {
      progress("Step 2/4: Skipped — weight already set (stale nonce).")
    } else {
      throw new Error(
        `[completeDelegatorRemoval] Step 2 failed — setDelegatorRemovalWeightOnPChain: ${msg}`,
      )
    }
  }

  // --- Step 3 ---
  progress("Step 3/4: Collecting P-Chain weight confirmation signatures...")
  let signedPChainWarpMessage: string
  try {
    signedPChainWarpMessage = await collectDelegatorRemovalWarpSignatures({
      network,
      validationID: receiptData.validationID,
      nonce: receiptData.nonce,
      validatorWeight: receiptData.validatorWeight,
      signingSubnetId: receiptData.signingSubnetId,
      glacierUrl,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRemoval] Step 3 failed — collectDelegatorRemovalWarpSignatures: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress("Step 3/4: Done.")

  // --- Step 4 ---
  progress("Step 4/4: Submitting completeDelegatorRemoval on C-Chain...")
  let hash: Hex
  try {
    hash = await submitCompleteDelegatorRemoval({
      walletClient,
      publicClient,
      stakingVaultAddress,
      delegationID: receiptData.delegationID,
      signedPChainWarpMessage,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRemoval] Step 4 failed — submitCompleteDelegatorRemoval: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 4/4: Done. C-Chain tx hash=${hash}`)

  return hash
}
