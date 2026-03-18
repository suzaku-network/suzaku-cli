import type { Hex, WalletClient, PublicClient, Transport, Chain, Account } from "viem"
import type { Network, NodeId } from "../types"
import type { PChainSigner, SignerDebugLog } from "../pchain/signer"

export interface PChainOwnerParam {
  threshold: number
  addresses: Hex[]
}

// --- Validator Registration ---

export interface InitiateValidatorRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  nodeId: NodeId
  blsKey: Hex
  remainingBalanceOwner: PChainOwnerParam
  disableOwner: PChainOwnerParam
  stakeAmount: bigint
}

export interface CompleteValidatorRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  blsProofOfPossession: string
  initiateTxHash: Hex
  initialBalance: bigint
  pChainSigner: PChainSigner
  glacierUrl?: string
  onProgress?: (step: string) => void
  debug?: SignerDebugLog
}

export interface ParseInitiateReceiptParams {
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateTxHash: Hex
}

export interface InitiateReceiptData {
  validationID: Hex
  nodeId: NodeId
  validatorManagerAddress: Hex
  warpMessage: Hex
  signingSubnetId: string
  subnetID: string
}

export interface CheckPChainRegistrationParams {
  network: Network
  subnetID: string
  nodeId: NodeId
}

export interface RegisterOnPChainParams {
  network: Network
  pChainSigner: PChainSigner
  blsProofOfPossession: string
  warpMessage: Hex
  signingSubnetId: string
  initialBalance: bigint
  glacierUrl?: string
  debug?: SignerDebugLog
}

export interface CollectPChainWarpSignaturesParams {
  network: Network
  validationID: Hex
  signingSubnetId: string
  glacierUrl?: string
}

export interface SubmitCompleteRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  signedPChainWarpMessage: string
}

// --- Validator Removal ---

export interface InitiateValidatorRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  nodeId: NodeId
}

export interface CompleteValidatorRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateRemovalTxHash: Hex
  initiateTxHash?: Hex
  pChainSigner: PChainSigner
  glacierUrl?: string
  onProgress?: (step: string) => void
  debug?: SignerDebugLog
}

export interface ParseRemovalReceiptParams {
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateRemovalTxHash: Hex
}

export interface RemovalReceiptData {
  validationID: Hex
  nodeId: NodeId
  validatorManagerAddress: Hex
  warpMessage: Hex
  signingSubnetId: string
  subnetID: string
}

export interface SetWeightOnPChainParams {
  network: Network
  pChainSigner: PChainSigner
  warpMessage: Hex
  signingSubnetId: string
  glacierUrl?: string
  debug?: SignerDebugLog
}

export interface CollectRemovalWarpSignaturesParams {
  publicClient: PublicClient<Transport, Chain>
  network: Network
  validationID: Hex
  nodeId: NodeId
  signingSubnetId: string
  initiateTxBlockNumber?: bigint
  glacierUrl?: string
}

export interface SubmitCompleteRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  signedPChainWarpMessage: string
}

// --- Delegator Registration ---

export interface InitiateDelegatorRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  nodeId: NodeId
  stakeAmount: bigint
}

export interface CompleteDelegatorRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateTxHash: Hex
  rpcUrl: string
  pChainSigner: PChainSigner
  glacierUrl?: string
  onProgress?: (step: string) => void
  debug?: SignerDebugLog
}

export interface ParseDelegatorReceiptParams {
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateTxHash: Hex
}

export interface DelegatorReceiptData {
  delegationID: Hex
  validationID: Hex
  validatorWeight: bigint
  nonce: bigint
  setWeightMessageID: Hex
  nodeId: NodeId
  validatorManagerAddress: Hex
  warpMessage: Hex
  signingSubnetId: string
  uptimeBlockchainID: string
}

export interface SetDelegatorWeightOnPChainParams {
  network: Network
  pChainSigner: PChainSigner
  warpMessage: Hex
  signingSubnetId: string
  glacierUrl?: string
  debug?: SignerDebugLog
}

export interface CollectDelegatorPChainSignaturesParams {
  network: Network
  validationID: Hex
  nonce: bigint
  validatorWeight: bigint
  signingSubnetId: string
  glacierUrl?: string
}

export interface SubmitCompleteDelegatorRegistrationParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  delegationID: Hex
  signedPChainWeightMessage: string
  nodeId: NodeId
  rpcUrl: string
  uptimeBlockchainID: string
  signingSubnetId: string
  glacierUrl?: string
}

// --- Delegator Removal ---

export interface InitiateDelegatorRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  delegationID: Hex
}

export interface CompleteDelegatorRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateRemovalTxHash: Hex
  initiateTxHash?: Hex
  pChainSigner: PChainSigner
  glacierUrl?: string
  onProgress?: (step: string) => void
  debug?: SignerDebugLog
}

export interface ParseDelegatorRemovalReceiptParams {
  publicClient: PublicClient<Transport, Chain>
  network: Network
  stakingVaultAddress: Hex
  initiateRemovalTxHash: Hex
}

export interface DelegatorRemovalReceiptData {
  delegationID: Hex
  validationID: Hex
  nodeId: NodeId
  validatorWeight: bigint
  nonce: bigint
  setWeightMessageID: Hex
  validatorManagerAddress: Hex
  warpMessage: Hex
  signingSubnetId: string
}

export interface CollectDelegatorRemovalWarpSignaturesParams {
  network: Network
  validationID: Hex
  nonce: bigint
  validatorWeight: bigint
  signingSubnetId: string
  glacierUrl?: string
}

export interface SubmitCompleteDelegatorRemovalParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
  delegationID: Hex
  signedPChainWarpMessage: string
}

// ---------------------------------------------------------------------------
// Claim Operator Fees
// ---------------------------------------------------------------------------

export interface ClaimOperatorFeesParams {
  walletClient: WalletClient<Transport, Chain, Account>
  publicClient: PublicClient<Transport, Chain>
  stakingVaultAddress: Hex
}
