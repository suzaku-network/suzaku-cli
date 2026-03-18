import {
  type Hex,
  parseEventLogs,
  hexToBytes,
  bytesToHex,
  getContract,
} from "viem"
import { utils } from "@avalabs/avalanchejs"
import { StakingVaultABI } from "../abis/StakingVault"
import { ValidatorManagerABI } from "../abis/ValidatorManager"
import { IWarpMessengerABI } from "../abis/IWarpMessenger"
import { createSdkContract } from "../contracts/createContract"
import { encodeNodeID } from "../utils/encoding"
import { resolveFromVault } from "../utils/resolveAddresses"
import { getRegistrationJustification } from "../utils/justification"
import { getCurrentValidators, getSigningSubnetIdFromWarpMessage } from "../pchain/client"
import { setValidatorWeight } from "../pchain/setValidatorWeight"
import { collectSignatures } from "../warp/collectSignatures"
import {
  packL1ValidatorRegistration,
  packWarpIntoAccessList,
} from "../warp/packing"
import { P_CHAIN_CHAIN_ID, NETWORK_IDS } from "../types"
import type { NodeId } from "../types"
import type {
  CompleteValidatorRemovalParams,
  ParseRemovalReceiptParams,
  RemovalReceiptData,
  CheckPChainRegistrationParams,
  SetWeightOnPChainParams,
  CollectRemovalWarpSignaturesParams,
  SubmitCompleteRemovalParams,
} from "./types"

// ---------------------------------------------------------------------------
// Step 1: Parse the initiate removal transaction receipt
// ---------------------------------------------------------------------------

export const parseRemovalReceipt = async (
  params: ParseRemovalReceiptParams,
): Promise<RemovalReceiptData> => {
  const { publicClient, network, stakingVaultAddress, initiateRemovalTxHash } = params

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: initiateRemovalTxHash,
  })

  if (receipt.status === "reverted") {
    throw new Error(
      `[parseRemovalReceipt] Initiate removal transaction ${initiateRemovalTxHash} reverted.`,
    )
  }

  const vaultEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: "StakingVault__ValidatorRemovalInitiated",
  })

  if (vaultEvents.length === 0) {
    throw new Error(
      `[parseRemovalReceipt] No StakingVault__ValidatorRemovalInitiated event in tx ${initiateRemovalTxHash}. ` +
      `Found ${receipt.logs.length} log(s).`,
    )
  }

  const validationID = vaultEvents[0].args.validationID as Hex

  const { validatorManagerAddress } = await resolveFromVault(stakingVaultAddress, publicClient)

  const validatorManagerContract = getContract({
    abi: ValidatorManagerABI,
    address: validatorManagerAddress,
    client: publicClient,
  })

  const validator = await validatorManagerContract.read.getValidator([validationID])
  const nodeId = encodeNodeID(validator.nodeID as Hex) as NodeId

  const initiatedRemovals = parseEventLogs({
    abi: ValidatorManagerABI,
    logs: receipt.logs,
    eventName: "InitiatedValidatorRemoval",
  })

  const validatorManagerEvent = initiatedRemovals.find(
    (e) => e.args.validationID === validationID,
  )

  const warpLogs = parseEventLogs({
    abi: IWarpMessengerABI,
    logs: receipt.logs,
  })

  const warpLog = validatorManagerEvent
    ? warpLogs.find(
        (w) => w.args.messageID === (validatorManagerEvent.args as { validatorWeightMessageID?: Hex }).validatorWeightMessageID,
      ) ?? warpLogs[0]
    : warpLogs[0]

  if (!warpLog) {
    throw new Error(
      `[parseRemovalReceipt] No IWarpMessenger event in tx ${initiateRemovalTxHash}.`,
    )
  }

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(
    network,
    warpLog.args.message,
  )

  const subnetIDHex = await validatorManagerContract.read.subnetID()
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex as Hex))

  return {
    validationID,
    nodeId,
    validatorManagerAddress,
    warpMessage: warpLog.args.message as Hex,
    signingSubnetId,
    subnetID,
  }
}

// ---------------------------------------------------------------------------
// Step 2: Check if validator is still on P-Chain (reuse from registration)
// ---------------------------------------------------------------------------

export { checkPChainRegistration } from "./completeValidatorRegistration"

// ---------------------------------------------------------------------------
// Step 3: Set validator weight to 0 on P-Chain
// ---------------------------------------------------------------------------

export const setWeightOnPChain = async (
  params: SetWeightOnPChainParams,
): Promise<Hex> => {
  const {
    network,
    pChainSigner,
    warpMessage,
    signingSubnetId,
    glacierUrl,
    debug,
  } = params

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
// Step 4: Collect removal warp signatures (with justification)
// Uses P_CHAIN_CHAIN_ID for justification (StakingVault pattern)
// ---------------------------------------------------------------------------

export const collectRemovalWarpSignatures = async (
  params: CollectRemovalWarpSignaturesParams,
): Promise<string> => {
  const {
    publicClient,
    network,
    validationID,
    nodeId,
    signingSubnetId,
    initiateTxBlockNumber,
    glacierUrl,
  } = params

  const justification = await getRegistrationJustification({
    nodeId,
    validationID,
    subnetID: P_CHAIN_CHAIN_ID,
    publicClient,
    startBlock: initiateTxBlockNumber,
  })

  const validationIDBytes = hexToBytes(validationID)
  const unsignedPChainWarpMsg = packL1ValidatorRegistration(
    validationIDBytes,
    false,
    NETWORK_IDS[network],
    P_CHAIN_CHAIN_ID,
  )
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg)

  const signedPChainMessage = await collectSignatures({
    network,
    message: unsignedPChainWarpMsgHex,
    justification,
    signingSubnetId,
    glacierUrl,
  })

  return signedPChainMessage
}

// ---------------------------------------------------------------------------
// Step 5: Submit completeValidatorRemoval on C-Chain
// ---------------------------------------------------------------------------

export const submitCompleteRemoval = async (
  params: SubmitCompleteRemovalParams,
): Promise<Hex> => {
  const { walletClient, publicClient, stakingVaultAddress, signedPChainWarpMessage } = params

  const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainWarpMessage}`)
  const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes)

  const messageIndex = 0

  const completeContract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await completeContract.safeWrite.completeValidatorRemoval(
    [messageIndex],
    { accessList },
  )

  return hash
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export const completeValidatorRemoval = async (
  params: CompleteValidatorRemovalParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    network,
    stakingVaultAddress,
    initiateRemovalTxHash,
    initiateTxHash,
    pChainSigner,
    glacierUrl,
    onProgress,
    debug,
  } = params

  const progress = onProgress ?? (() => {})

  // --- Step 1 ---
  progress("Step 1/5: Parsing initiate removal receipt...")
  let receiptData: RemovalReceiptData
  try {
    receiptData = await parseRemovalReceipt({
      publicClient,
      network,
      stakingVaultAddress,
      initiateRemovalTxHash,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRemoval] Step 1 failed — parseRemovalReceipt: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 1/5: Done. validationID=${receiptData.validationID}, nodeId=${receiptData.nodeId}`)

  // --- Step 2 ---
  progress("Step 2/5: Checking P-Chain registration status...")
  let isStillRegistered: boolean
  try {
    const currentValidators = await getCurrentValidators(network, receiptData.subnetID)
    isStillRegistered = currentValidators.some((v) => v.nodeID === receiptData.nodeId)
  } catch (error) {
    throw new Error(
      `[completeValidatorRemoval] Step 2 failed — checkPChainRegistration: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 2/5: Done. Still on P-Chain: ${isStillRegistered}`)

  // --- Step 3 ---
  if (isStillRegistered) {
    progress("Step 3/5: Setting validator weight to 0 on P-Chain (wallet will prompt)...")
    try {
      const pChainTxId = await setWeightOnPChain({
        network,
        pChainSigner,
        warpMessage: receiptData.warpMessage,
        signingSubnetId: receiptData.signingSubnetId,
        glacierUrl,
        debug,
      })
      progress(`Step 3/5: Done. P-Chain txID=${pChainTxId}`)
    } catch (error) {
      throw new Error(
        `[completeValidatorRemoval] Step 3 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else {
    progress("Step 3/5: Skipped — validator already removed from P-Chain.")
  }

  // --- Step 4 ---
  progress("Step 4/5: Collecting justification and P-Chain warp signatures...")
  let signedPChainWarpMessage: string
  try {
    let initiateTxBlockNumber: bigint | undefined
    if (initiateTxHash) {
      const r = await publicClient.waitForTransactionReceipt({ hash: initiateTxHash })
      initiateTxBlockNumber = r.blockNumber
    }

    signedPChainWarpMessage = await collectRemovalWarpSignatures({
      publicClient,
      network,
      validationID: receiptData.validationID,
      nodeId: receiptData.nodeId,
      signingSubnetId: receiptData.signingSubnetId,
      initiateTxBlockNumber,
      glacierUrl,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRemoval] Step 4 failed — collectRemovalWarpSignatures: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress("Step 4/5: Done.")

  // --- Step 5 ---
  progress("Step 5/5: Submitting completeValidatorRemoval on C-Chain...")
  let hash: Hex
  try {
    hash = await submitCompleteRemoval({
      walletClient,
      publicClient,
      stakingVaultAddress,
      signedPChainWarpMessage,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRemoval] Step 5 failed — submitCompleteRemoval: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 5/5: Done. C-Chain tx hash=${hash}`)

  return hash
}
