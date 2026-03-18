import type { Hex } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { createSdkContract } from "../contracts/createContract"
import type { InitiateDelegatorRemovalParams } from "./types"

/**
 * Initiates delegator removal via the StakingVault contract (C-Chain).
 *
 * Simply calls `stakingVault.initiateDelegatorRemoval(delegationID)`.
 *
 * @returns The transaction hash of the initiate removal call.
 */
export const initiateDelegatorRemoval = async (
  params: InitiateDelegatorRemovalParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    stakingVaultAddress,
    delegationID,
  } = params

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await contract.safeWrite.initiateDelegatorRemoval([delegationID])

  return hash
}
