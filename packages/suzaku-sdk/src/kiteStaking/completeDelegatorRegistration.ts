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
import { encodeNodeID, cb58ToBytes, uint8ArrayToHex } from "../utils/encoding"
import { resolveFromVault } from "../utils/resolveAddresses"
import { getSigningSubnetIdFromWarpMessage } from "../pchain/client"
import { setValidatorWeight } from "../pchain/setValidatorWeight"
import { collectSignatures } from "../warp/collectSignatures"
import {
  packL1ValidatorWeightMessage,
  packValidationUptimeMessage,
  packWarpIntoAccessList,
} from "../warp/packing"
import { validatedBy } from "../pchain/client"
import { P_CHAIN_CHAIN_ID, NETWORK_IDS } from "../types"
import type { NodeId } from "../types"
import type {
  CompleteDelegatorRegistrationParams,
  ParseDelegatorReceiptParams,
  DelegatorReceiptData,
  SetDelegatorWeightOnPChainParams,
  CollectDelegatorPChainSignaturesParams,
  SubmitCompleteDelegatorRegistrationParams,
} from "./types"

// ---------------------------------------------------------------------------
// Uptime helper
// ---------------------------------------------------------------------------

interface NodeValidatorInfo {
  validationID: string
  nodeID: string
  uptimeSeconds: number
  isActive: boolean
}

interface ValidatorsRpcResponse {
  result: { validators: NodeValidatorInfo[] }
  error?: unknown
}

const getCurrentValidatorsFromNode = async (rpcUrl: string): Promise<NodeValidatorInfo[]> => {
  const url = rpcUrl.endsWith("/validators") ? rpcUrl : `${rpcUrl}/validators`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "validators.getCurrentValidators",
      params: { nodeIDs: [] },
      id: 1,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `validators.getCurrentValidators HTTP ${response.status}: ${text.slice(0, 200)} (url: ${url})`,
    )
  }
  let data: ValidatorsRpcResponse
  try {
    data = JSON.parse(text) as ValidatorsRpcResponse
  } catch {
    throw new Error(
      `validators.getCurrentValidators returned non-JSON from ${url}: ${text.slice(0, 200)}`,
    )
  }
  if (data.error) throw new Error(`validators.getCurrentValidators failed: ${JSON.stringify(data.error)}`)
  return data.result.validators
}

// ---------------------------------------------------------------------------
// Step 1: Parse the initiate delegator registration receipt
// ---------------------------------------------------------------------------

export const parseDelegatorReceipt = async (
  params: ParseDelegatorReceiptParams,
): Promise<DelegatorReceiptData> => {
  const { publicClient, network, stakingVaultAddress, initiateTxHash } = params

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: initiateTxHash,
  })

  if (receipt.status === "reverted") {
    throw new Error(
      `[parseDelegatorReceipt] Transaction ${initiateTxHash} reverted.`,
    )
  }

  const { validatorManagerAddress, uptimeBlockchainID } = await resolveFromVault(stakingVaultAddress, publicClient)

  const vaultEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: "StakingVault__DelegatorRegistrationInitiated",
  })

  if (vaultEvents.length === 0) {
    throw new Error(
      `[parseDelegatorReceipt] No StakingVault__DelegatorRegistrationInitiated event in tx ${initiateTxHash}.`,
    )
  }

  const event = vaultEvents[0]
  const delegationID = event.args.delegationID as Hex
  const validationID = event.args.validationID as Hex

  const weightUpdateEvents = parseEventLogs({
    abi: ValidatorManagerABI,
    logs: receipt.logs,
    eventName: "InitiatedValidatorWeightUpdate",
  })

  const weightUpdateEvent = weightUpdateEvents.find(
    (e) => e.args.validationID === validationID,
  )

  if (!weightUpdateEvent) {
    throw new Error(
      `[parseDelegatorReceipt] No InitiatedValidatorWeightUpdate event for validationID ${validationID} in tx ${initiateTxHash}.`,
    )
  }

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

  const weightWarpLog = warpLogs.find(
    (w) => w.args.messageID === setWeightMessageID,
  )
  if (!weightWarpLog) {
    throw new Error(
      `[parseDelegatorReceipt] No warp log matching setWeightMessageID ${setWeightMessageID}.`,
    )
  }

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(
    network,
    warpLogs[0].args.message,
  )

  const uptimeBlockchainIDStr = utils.base58check.encode(
    hexToBytes(uptimeBlockchainID),
  )

  return {
    delegationID,
    validationID,
    validatorWeight,
    nonce,
    setWeightMessageID,
    nodeId,
    validatorManagerAddress,
    warpMessage: weightWarpLog.args.message as Hex,
    signingSubnetId,
    uptimeBlockchainID: uptimeBlockchainIDStr,
  }
}

// ---------------------------------------------------------------------------
// Step 2: Set validator weight on P-Chain (increased weight with delegation)
// ---------------------------------------------------------------------------

export const setDelegatorWeightOnPChain = async (
  params: SetDelegatorWeightOnPChainParams,
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
// Step 3: Collect P-Chain weight confirmation signatures
// ---------------------------------------------------------------------------

export const collectDelegatorPChainSignatures = async (
  params: CollectDelegatorPChainSignaturesParams,
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
  const unsignedPChainWeightMsg = packL1ValidatorWeightMessage(
    validationIDBytes,
    nonce,
    validatorWeight,
    NETWORK_IDS[network],
    P_CHAIN_CHAIN_ID,
  )
  const unsignedHex = bytesToHex(unsignedPChainWeightMsg)

  const signedPChainMessage = await collectSignatures({
    network,
    message: unsignedHex,
    signingSubnetId,
    glacierUrl,
  })

  return signedPChainMessage
}

// ---------------------------------------------------------------------------
// Step 4: Submit completeDelegatorRegistration on C-Chain
// Uses RPC URL pattern: ${rpcUrl}/ext/bc/${sourceChainID}
// ---------------------------------------------------------------------------

export const submitCompleteDelegatorRegistration = async (
  params: SubmitCompleteDelegatorRegistrationParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    network,
    stakingVaultAddress,
    delegationID,
    signedPChainWeightMessage,
    nodeId,
    rpcUrl,
    uptimeBlockchainID,
    signingSubnetId,
    glacierUrl,
  } = params

  const validatorRpcUrl = rpcUrl.includes("/ext/bc/")
    ? rpcUrl
    : `${rpcUrl}/ext/bc/${uptimeBlockchainID}`
  const validators = await getCurrentValidatorsFromNode(validatorRpcUrl)
  const validator = validators.find((v) => v.nodeID === nodeId)
  if (!validator) {
    const available = validators.map((v) => v.nodeID).join(", ")
    throw new Error(
      `Validator ${nodeId} not found in L1 node RPC. Available: [${available}]`,
    )
  }

  const networkID = NETWORK_IDS[network]
  const validationIDBytes = cb58ToBytes(validator.validationID)
  const unsignedUptimeMsg = packValidationUptimeMessage(
    validationIDBytes,
    validator.uptimeSeconds,
    networkID,
    uptimeBlockchainID,
  )
  const unsignedUptimeMsgHex = uint8ArrayToHex(unsignedUptimeMsg)

  const uptimeSigningSubnetId = await validatedBy(network, uptimeBlockchainID)
  if (!uptimeSigningSubnetId) {
    throw new Error(`Could not find signing subnet ID for chain ${uptimeBlockchainID}`)
  }

  const signedUptimeMessage = await collectSignatures({
    network,
    message: unsignedUptimeMsgHex,
    signingSubnetId: uptimeSigningSubnetId,
    glacierUrl,
  })

  const signedUptimeHex = signedUptimeMessage.startsWith("0x")
    ? signedUptimeMessage
    : `0x${signedUptimeMessage}`

  const weightMsgBytes = hexToBytes(`0x${signedPChainWeightMessage}`)
  const uptimeMsgBytes = hexToBytes(signedUptimeHex as Hex)

  const weightAccessList = packWarpIntoAccessList(weightMsgBytes)
  const uptimeAccessList = packWarpIntoAccessList(uptimeMsgBytes)

  const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]]

  const messageIndex = 0
  const uptimeMessageIndex = 1

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await contract.safeWrite.completeDelegatorRegistration(
    [delegationID, messageIndex, uptimeMessageIndex],
    { accessList: combinedAccessList },
  )

  return hash
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export const completeDelegatorRegistration = async (
  params: CompleteDelegatorRegistrationParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    network,
    stakingVaultAddress,
    initiateTxHash,
    rpcUrl,
    pChainSigner,
    glacierUrl,
    onProgress,
    debug,
  } = params

  const progress = onProgress ?? (() => {})

  // --- Step 1 ---
  progress("Step 1/4: Parsing initiate delegator registration receipt...")
  let receiptData: DelegatorReceiptData
  try {
    receiptData = await parseDelegatorReceipt({
      publicClient,
      network,
      stakingVaultAddress,
      initiateTxHash,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRegistration] Step 1 failed — parseDelegatorReceipt: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(
    `Step 1/4: Done. delegationID=${receiptData.delegationID}, validationID=${receiptData.validationID}, nodeId=${receiptData.nodeId}`,
  )
  progress(`[debug] signingSubnetId=${receiptData.signingSubnetId}`)
  progress(`[debug] warpMessage=${receiptData.warpMessage}`)

  // --- Step 2 ---
  progress("Step 2/4: Setting validator weight on P-Chain (wallet will prompt)...")
  try {
    const pChainTxId = await setDelegatorWeightOnPChain({
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
        `[completeDelegatorRegistration] Step 2 failed — setDelegatorWeightOnPChain: ${msg}`,
      )
    }
  }

  // --- Step 3 ---
  progress("Step 3/4: Collecting P-Chain weight confirmation signatures...")
  let signedPChainWeightMessage: string
  try {
    signedPChainWeightMessage = await collectDelegatorPChainSignatures({
      network,
      validationID: receiptData.validationID,
      nonce: receiptData.nonce,
      validatorWeight: receiptData.validatorWeight,
      signingSubnetId: receiptData.signingSubnetId,
      glacierUrl,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRegistration] Step 3 failed — collectDelegatorPChainSignatures: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress("Step 3/4: Done.")

  // --- Step 4 ---
  progress("Step 4/4: Getting uptime proof and submitting completeDelegatorRegistration...")
  let hash: Hex
  try {
    hash = await submitCompleteDelegatorRegistration({
      walletClient,
      publicClient,
      network,
      stakingVaultAddress,
      delegationID: receiptData.delegationID,
      signedPChainWeightMessage,
      nodeId: receiptData.nodeId,
      rpcUrl,
      uptimeBlockchainID: receiptData.uptimeBlockchainID,
      signingSubnetId: receiptData.signingSubnetId,
      glacierUrl,
    })
  } catch (error) {
    throw new Error(
      `[completeDelegatorRegistration] Step 4 failed — submitCompleteDelegatorRegistration: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 4/4: Done. C-Chain tx hash=${hash}`)

  return hash
}
