import type { Hex } from "viem"
import { StakingVaultABI } from "../abis/StakingVault"
import { createSdkContract } from "../contracts/createContract"
import { parseNodeID } from "../utils/encoding"
import type { InitiateValidatorRegistrationParams } from "./types"

/**
 * Initiates validator registration via the StakingVault contract (C-Chain).
 *
 * The vault uses its own funds (non-payable). The `stakeAmount` parameter
 * tells the vault how much to allocate from its pool.
 *
 * @returns The transaction hash of the initiate call.
 */
export const initiateValidatorRegistration = async (
  params: InitiateValidatorRegistrationParams,
): Promise<Hex> => {
  const {
    walletClient,
    publicClient,
    stakingVaultAddress,
    nodeId,
    blsKey,
    remainingBalanceOwner,
    disableOwner,
    stakeAmount,
  } = params

  const contract = createSdkContract({
    abi: StakingVaultABI,
    address: stakingVaultAddress,
    walletClient,
    publicClient,
  })

  const nodeIdHex = parseNodeID(nodeId, false)

  const hash = await contract.safeWrite.initiateValidatorRegistration(
    [
      nodeIdHex,
      blsKey,
      {
        threshold: remainingBalanceOwner.threshold,
        addresses: remainingBalanceOwner.addresses,
      },
      {
        threshold: disableOwner.threshold,
        addresses: disableOwner.addresses,
      },
      stakeAmount,
    ],
  )

  return hash
}
