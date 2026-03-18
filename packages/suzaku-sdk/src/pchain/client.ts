import { pvm, utils } from "@avalabs/avalanchejs"
import { hexToBytes, type Hex } from "viem"
import type { Network } from "../types"

const P_CHAIN_RPC: Record<Network, string> = {
  fuji: "https://api.avax-test.network",
  mainnet: "https://api.avax.network",
}

export const getPChainBaseUrl = (network: Network): string => P_CHAIN_RPC[network]

type ValidatorsResponsePatched = (pvm.GetCurrentValidatorsResponse["validators"][number] & {
  balance?: number
  validationID?: string
})[]

export const getCurrentValidators = async (
  network: Network,
  subnetId: string,
): Promise<ValidatorsResponsePatched> => {
  const rpcUrl = getPChainBaseUrl(network)
  const pvmApi = new pvm.PVMApi(rpcUrl)
  const response = await pvmApi.getCurrentValidators({
    subnetID: subnetId,
  })
  return response.validators
}

export const validatedBy = async (
  network: Network,
  blockchainId: string,
): Promise<string | undefined> => {
  const rpcUrl = getPChainBaseUrl(network)
  const pvmApi = new pvm.PVMApi(rpcUrl)
  const response = await pvmApi.validatedBy({
    blockchainID: blockchainId,
  })
  if (!response.subnetID) return undefined
  return response.subnetID
}

export const getSigningSubnetIdFromWarpMessage = async (
  network: Network,
  message: string,
): Promise<string> => {
  const signingChainIdHex = ("0x" + message.slice(14, 78)) as Hex
  const signingChainId = utils.base58check.encode(hexToBytes(signingChainIdHex))
  const signingSubnetId = await validatedBy(network, signingChainId)
  if (!signingSubnetId) throw new Error("Could not find signing subnet ID")
  return signingSubnetId
}
