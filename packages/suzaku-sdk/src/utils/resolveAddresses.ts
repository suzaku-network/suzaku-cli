import { type Hex, type PublicClient, type Transport, type Chain, getContract } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { KiteStakingManagerABI } from "../abis/KiteStakingManager"
import { ValidatorManagerABI } from "../abis/ValidatorManager"

export interface ResolvedAddresses {
  kiteStakingManagerAddress: Hex
  validatorManagerAddress: Hex
  uptimeBlockchainID: Hex
}

export const resolveFromVault = async (
  stakingVaultAddress: Hex,
  publicClient: PublicClient<Transport, Chain>,
): Promise<ResolvedAddresses> => {
  const vault = getContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    client: publicClient,
  })

  const kiteStakingManagerAddress = (await vault.read.getStakingManager()) as Hex

  const kiteStakingManager = getContract({
    abi: KiteStakingManagerABI,
    address: kiteStakingManagerAddress,
    client: publicClient,
  })

  const settings = await kiteStakingManager.read.getStakingManagerSettings()
  const validatorManagerAddress = settings.manager as Hex
  const uptimeBlockchainID = settings.uptimeBlockchainID as Hex

  return {
    kiteStakingManagerAddress,
    validatorManagerAddress,
    uptimeBlockchainID,
  }
}
