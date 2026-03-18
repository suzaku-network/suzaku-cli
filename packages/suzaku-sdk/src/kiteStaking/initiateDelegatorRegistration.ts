import { type Hex, getContract } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { ValidatorManagerABI } from "../abis/ValidatorManager"
import { createSdkContract } from "../contracts/createContract"
import { parseNodeID } from "../utils/encoding"
import { resolveFromVault } from "../utils/resolveAddresses"
import type { InitiateDelegatorRegistrationParams } from "./types"

/**
 * Initiates delegator registration via the StakingVault contract (C-Chain).
 *
 * Looks up the validationID from the nodeId, then calls
 * `stakingVault.initiateDelegatorRegistration(validationID, stakeAmount)`.
 * Non-payable -- funds come from the vault pool.
 *
 * @returns The transaction hash of the initiate call.
 */
export const initiateDelegatorRegistration = async (
  params: InitiateDelegatorRegistrationParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    stakingVaultAddress,
    nodeId,
    stakeAmount,
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

  const hash = await contract.safeWrite.initiateDelegatorRegistration(
    [validationID, stakeAmount],
  )

  return hash
}
