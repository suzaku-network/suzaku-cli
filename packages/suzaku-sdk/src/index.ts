// Validator Registration
export {
  initiateValidatorRegistration,
  completeValidatorRegistration,
  parseInitiateReceipt,
  checkPChainRegistration,
  registerOnPChain,
  collectPChainWarpSignatures,
  submitCompleteRegistration,
  type InitiateValidatorRegistrationParams,
  type CompleteValidatorRegistrationParams,
  type PChainOwnerParam,
  type ParseInitiateReceiptParams,
  type InitiateReceiptData,
  type CheckPChainRegistrationParams,
  type RegisterOnPChainParams,
  type CollectPChainWarpSignaturesParams,
  type SubmitCompleteRegistrationParams,
} from "./kiteStaking"

// Validator Removal
export {
  initiateValidatorRemoval,
  completeValidatorRemoval,
  parseRemovalReceipt,
  setWeightOnPChain,
  collectRemovalWarpSignatures,
  submitCompleteRemoval,
  type InitiateValidatorRemovalParams,
  type CompleteValidatorRemovalParams,
  type ParseRemovalReceiptParams,
  type RemovalReceiptData,
  type SetWeightOnPChainParams,
  type CollectRemovalWarpSignaturesParams,
  type SubmitCompleteRemovalParams,
} from "./kiteStaking"

// Delegator Registration
export {
  initiateDelegatorRegistration,
  completeDelegatorRegistration,
  parseDelegatorReceipt,
  setDelegatorWeightOnPChain,
  collectDelegatorPChainSignatures,
  submitCompleteDelegatorRegistration,
  type InitiateDelegatorRegistrationParams,
  type CompleteDelegatorRegistrationParams,
  type ParseDelegatorReceiptParams,
  type DelegatorReceiptData,
  type SetDelegatorWeightOnPChainParams,
  type CollectDelegatorPChainSignaturesParams,
  type SubmitCompleteDelegatorRegistrationParams,
} from "./kiteStaking"

// Delegator Removal
export {
  initiateDelegatorRemoval,
  completeDelegatorRemoval,
  parseDelegatorRemovalReceipt,
  setDelegatorRemovalWeightOnPChain,
  collectDelegatorRemovalWarpSignatures,
  submitCompleteDelegatorRemoval,
  type InitiateDelegatorRemovalParams,
  type CompleteDelegatorRemovalParams,
  type ParseDelegatorRemovalReceiptParams,
  type DelegatorRemovalReceiptData,
  type CollectDelegatorRemovalWarpSignaturesParams,
  type SubmitCompleteDelegatorRemovalParams,
} from "./kiteStaking"

// Claim Operator Fees
export {
  claimOperatorFees,
  type ClaimOperatorFeesParams,
} from "./kiteStaking"

// P-Chain wallet integration
export {
  createCoreWalletPChainSigner,
  type PChainSigner,
  type EIP1193Provider,
  type AvalancheSignTransactionResult,
  type CreateCoreWalletPChainSignerOptions,
  type SignerDebugLog,
} from "./pchain"

// Types
export {
  type Network,
  type NodeId,
  type PChainAddress,
  type SdkWalletClient,
  type SdkPublicClient,
  P_CHAIN_CHAIN_ID,
  GLACIER_URLS,
  NETWORK_IDS,
  AVALANCHE_C_CHAIN_IDS,
} from "./types"

// ABIs (for advanced consumers)
export {
  KiteStakingManagerABI,
  ValidatorManagerABI,
  IWarpMessengerABI,
  StakingVaultABI,
  SdkErrorsABI,
} from "./abis"

// Contract helpers
export { createSdkContract, type SdkContract } from "./contracts"

// Address resolution
export { resolveFromVault, type ResolvedAddresses } from "./utils/resolveAddresses"

// Justification utility
export { getRegistrationJustification } from "./utils/justification"
