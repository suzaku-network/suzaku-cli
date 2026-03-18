import type { Hex } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { createSdkContract } from "../contracts/createContract"
import type { ClaimOperatorFeesParams } from "./types"

export const claimOperatorFees = async (
  params: ClaimOperatorFeesParams,
): Promise<Hex> => {
  const { walletClient, publicClient, stakingVaultAddress } = params

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const hash = await contract.safeWrite.claimOperatorFees([])

  return hash
}
