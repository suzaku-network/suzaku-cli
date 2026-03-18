import { type Hex, getContract } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { ValidatorManagerABI } from "../abis/ValidatorManager"
import { createSdkContract } from "../contracts/createContract"
import { parseNodeID } from "../utils/encoding"
import { resolveFromVault } from "../utils/resolveAddresses"
import type { InitiateValidatorRemovalParams } from "./types"

/**
 * Initiates validator removal via the StakingVault contract (C-Chain).
 *
 * Looks up the validationID from the nodeId via the auto-resolved
 * ValidatorManager, then calls `stakingVault.initiateValidatorRemoval(validationID)`.
 *
 * @returns The transaction hash of the initiate removal call.
 */
export const initiateValidatorRemoval = async (
  params: InitiateValidatorRemovalParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    stakingVaultAddress,
    nodeId,
  } = params

  const { validatorManagerAddress } = await resolveFromVault(stakingVaultAddress, publicClient)

  const validatorManagerContract = getContract({
    abi: ValidatorManagerABI,
    address: validatorManagerAddress,
    client: publicClient,
  })

  const nodeIdBytes = parseNodeID(nodeId, false)
  const validationID = await validatorManagerContract.read.getNodeValidationID([nodeIdBytes])

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await contract.safeWrite.initiateValidatorRemoval([validationID])

  return hash
}
