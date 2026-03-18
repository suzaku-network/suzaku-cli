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
import { getCurrentValidators, getSigningSubnetIdFromWarpMessage } from "../pchain/client"
import { registerL1Validator } from "../pchain/registerValidator"
import { collectSignatures } from "../warp/collectSignatures"
import {
  packL1ValidatorRegistration,
  packWarpIntoAccessList,
} from "../warp/packing"
import { P_CHAIN_CHAIN_ID, NETWORK_IDS } from "../types"
import type { NodeId } from "../types"
import type {
  CompleteValidatorRegistrationParams,
  ParseInitiateReceiptParams,
  InitiateReceiptData,
  CheckPChainRegistrationParams,
  RegisterOnPChainParams,
  CollectPChainWarpSignaturesParams,
  SubmitCompleteRegistrationParams,
} from "./types"

// ---------------------------------------------------------------------------
// Step 1: Parse the initiate transaction receipt
// ---------------------------------------------------------------------------

export const parseInitiateReceipt = async (
  params: ParseInitiateReceiptParams,
): Promise<InitiateReceiptData> => {
  const { publicClient, network, stakingVaultAddress, initiateTxHash } = params

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: initiateTxHash,
  })

  if (receipt.status === "reverted") {
    throw new Error(
      `[parseInitiateReceipt] Initiate transaction ${initiateTxHash} reverted on-chain.`,
    )
  }

  const vaultEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: "StakingVault__ValidatorRegistrationInitiated",
  })

  if (vaultEvents.length === 0) {
    throw new Error(
      `[parseInitiateReceipt] No StakingVault__ValidatorRegistrationInitiated event in tx ${initiateTxHash}. ` +
      `Found ${receipt.logs.length} log(s). Verify the transaction hash and contract address.`,
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

  const warpLogs = parseEventLogs({
    abi: IWarpMessengerABI,
    logs: receipt.logs,
  })[0]

  if (!warpLogs) {
    throw new Error(
      `[parseInitiateReceipt] No IWarpMessenger event in tx ${initiateTxHash}. ` +
      `This usually means the precompile call didn't emit.`,
    )
  }

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(
    network,
    warpLogs.args.message,
  )

  const subnetIDHex = await validatorManagerContract.read.subnetID()
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex as Hex))

  return {
    validationID,
    nodeId,
    validatorManagerAddress,
    warpMessage: warpLogs.args.message as Hex,
    signingSubnetId,
    subnetID,
  }
}

// ---------------------------------------------------------------------------
// Step 2: Check if the validator is already registered on P-Chain
// ---------------------------------------------------------------------------

export const checkPChainRegistration = async (
  params: CheckPChainRegistrationParams,
): Promise<boolean> => {
  const { network, subnetID, nodeId } = params

  const currentValidators = await getCurrentValidators(network, subnetID)
  return currentValidators.some((v) => v.nodeID === nodeId)
}

// ---------------------------------------------------------------------------
// Step 3: Collect warp signatures + register validator on P-Chain
// ---------------------------------------------------------------------------

export const registerOnPChain = async (
  params: RegisterOnPChainParams,
): Promise<Hex> => {
  const {
    network,
    pChainSigner,
    blsProofOfPossession,
    warpMessage,
    signingSubnetId,
    initialBalance,
    glacierUrl,
    debug,
  } = params

  const signedMessage = await collectSignatures({
    network,
    message: warpMessage,
    signingSubnetId,
    glacierUrl,
  })

  const txId = await registerL1Validator({
    network,
    pChainSigner,
    blsProofOfPossession,
    signedMessage,
    initialBalance,
    debug,
  })

  return txId
}

// ---------------------------------------------------------------------------
// Step 4: Build P-Chain warp message and aggregate BLS signatures
// ---------------------------------------------------------------------------

export const collectPChainWarpSignatures = async (
  params: CollectPChainWarpSignaturesParams,
): Promise<string> => {
  const { network, validationID, signingSubnetId, glacierUrl } = params

  const validationIDBytes = hexToBytes(validationID)
  const unsignedPChainWarpMsg = packL1ValidatorRegistration(
    validationIDBytes,
    true,
    NETWORK_IDS[network],
    P_CHAIN_CHAIN_ID,
  )
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg)

  const signedPChainMessage = await collectSignatures({
    network,
    message: unsignedPChainWarpMsgHex,
    signingSubnetId,
    glacierUrl,
  })

  return signedPChainMessage
}

// ---------------------------------------------------------------------------
// Step 5: Submit the completeValidatorRegistration tx on C-Chain
// ---------------------------------------------------------------------------

export const submitCompleteRegistration = async (
  params: SubmitCompleteRegistrationParams,
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

  const hash = await completeContract.safeWrite.completeValidatorRegistration(
    [messageIndex],
    { accessList },
  )

  return hash
}

// ---------------------------------------------------------------------------
// Orchestrator — calls all steps in sequence with progress + error context
// ---------------------------------------------------------------------------

export const completeValidatorRegistration = async (
  params: CompleteValidatorRegistrationParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    network,
    stakingVaultAddress,
    blsProofOfPossession,
    initiateTxHash,
    initialBalance,
    pChainSigner,
    glacierUrl,
    onProgress,
    debug,
  } = params

  const progress = onProgress ?? (() => {})

  // --- Step 1 ---
  progress("Step 1/5: Parsing initiate transaction receipt...")
  let receiptData: InitiateReceiptData
  try {
    receiptData = await parseInitiateReceipt({
      publicClient,
      network,
      stakingVaultAddress,
      initiateTxHash,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRegistration] Step 1 failed — parseInitiateReceipt: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 1/5: Done. validationID=${receiptData.validationID}, nodeId=${receiptData.nodeId}`)

  // --- Step 2 ---
  progress("Step 2/5: Checking P-Chain registration status...")
  let isAlreadyRegistered: boolean
  try {
    isAlreadyRegistered = await checkPChainRegistration({
      network,
      subnetID: receiptData.subnetID,
      nodeId: receiptData.nodeId,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRegistration] Step 2 failed — checkPChainRegistration: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 2/5: Done. Already registered: ${isAlreadyRegistered}`)

  // --- Step 3 ---
  if (isAlreadyRegistered) {
    progress("Step 3/5: Skipped — validator already on P-Chain.")
  } else {
    progress("Step 3/5: Collecting warp signatures and registering on P-Chain (wallet will switch chain and prompt)...")
    try {
      const pChainTxId = await registerOnPChain({
        network,
        pChainSigner,
        blsProofOfPossession,
        warpMessage: receiptData.warpMessage,
        signingSubnetId: receiptData.signingSubnetId,
        initialBalance,
        glacierUrl,
        debug,
      })
      progress(`Step 3/5: Done. P-Chain txID=${pChainTxId}`)
    } catch (error) {
      throw new Error(
        `[completeValidatorRegistration] Step 3 failed — registerOnPChain: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // --- Step 4 ---
  progress("Step 4/5: Aggregating P-Chain warp signatures via Glacier...")
  let signedPChainWarpMessage: string
  try {
    signedPChainWarpMessage = await collectPChainWarpSignatures({
      network,
      validationID: receiptData.validationID,
      signingSubnetId: receiptData.signingSubnetId,
      glacierUrl,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRegistration] Step 4 failed — collectPChainWarpSignatures: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress("Step 4/5: Done.")

  // --- Step 5 ---
  progress("Step 5/5: Submitting completeValidatorRegistration on C-Chain...")
  let hash: Hex
  try {
    hash = await submitCompleteRegistration({
      walletClient,
      publicClient,
      stakingVaultAddress,
      signedPChainWarpMessage,
    })
  } catch (error) {
    throw new Error(
      `[completeValidatorRegistration] Step 5 failed — submitCompleteRegistration: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  progress(`Step 5/5: Done. C-Chain tx hash=${hash}`)

  return hash
}
