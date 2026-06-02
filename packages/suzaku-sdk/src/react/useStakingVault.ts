import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from 'wagmi';
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { useAvalanchePublicExtendedClient } from "./useAvalanchePublicExtendedClient";
import KiteStakingManagerABI from '../core/KiteStaking/abi';
import ValidatorManagerABI from '../core/ValidatorManager/abi';

import StakingVaultABI, { getStakingVault } from "../core/StakingVault/abi";
import {
  getValidatorManagerInfo,
  svInitiateValidatorRegistration,
  svCompleteValidatorRegistration,
  svInitiateValidatorRemoval,
  svForceRemoveValidator,
  svCompleteValidatorRemoval,
  svInitiateDelegatorRegistration,
  svCompleteDelegatorRegistration,
  svCompleteDelegatorRemoval,
  svClaimOperatorFees,
  type ValidatorManagerInfo,
  type PChainOwnerOptions,
} from "../core/StakingVault/service";
import type { NodeId } from "../core/lib/avalancheUtils";

export function useGetValidatorManagerInfo(contractAddress?: Address): UseQueryResult<ValidatorManagerInfo | null> {
  const client = useAvalanchePublicExtendedClient();
  return useQuery({
    queryKey: ["getValidatorManagerInfo", contractAddress],
    queryFn: async () => {
      if (!client || !contractAddress) return null;
      const contract = await getStakingVault(client, contractAddress);
      return getValidatorManagerInfo(client, contract);
    },
    enabled: !!client && !!contractAddress,
    staleTime: 30_000,
  });
}

export type SvInitiateValidatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  blsKey: Hex;
  stakeAmountWei: bigint;
  remainingBalanceOwner?: PChainOwnerOptions;
  disableOwner?: PChainOwnerOptions;
};

export function useSvInitiateValidatorRegistration(): UseMutationResult<Hex, Error, SvInitiateValidatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateValidatorRegistration(
        client, contract, params.nodeId, params.blsKey,
        params.stakeAmountWei, params.remainingBalanceOwner, params.disableOwner,
      );
    },
  });
}

export type SvCompleteValidatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  blsProofOfPossession: Hex;
  initialBalance: bigint;
  waitValidatorVisible?: boolean;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteValidatorRegistration(): UseMutationResult<Hex, Error, SvCompleteValidatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteValidatorRegistration(
        client, contract, client, params.initiateTxHash,
        params.blsProofOfPossession, params.initialBalance, params.waitValidatorVisible,
        params.onProgress,
      );
    },
  });
}

export type SvInitiateValidatorRemovalParams = {
  contractAddress: Address;
  nodeId: NodeId;
};

export function useSvInitiateValidatorRemoval(): UseMutationResult<{ hash: Hex; validationID: Hex }, Error, SvInitiateValidatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateValidatorRemoval(client, contract, params.nodeId);
    },
  });
}

export type SvForceRemoveValidatorParams = {
  contractAddress: Address;
  nodeId: NodeId;
};

export function useSvForceRemoveValidator(): UseMutationResult<Hex, Error, SvForceRemoveValidatorParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svForceRemoveValidator(client, contract, params.nodeId);
    },
  });
}

export type SvCompleteValidatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  nodeIDs?: NodeId[];
  waitValidatorVisible?: boolean;
  initiateTxHash?: Hex;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteValidatorRemoval(): UseMutationResult<void, Error, SvCompleteValidatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteValidatorRemoval(
        client, contract, client, params.initiateRemovalTxHash,
        params.nodeIDs, params.waitValidatorVisible, params.initiateTxHash, params.onProgress,
      );
    },
  });
}

export type SvInitiateDelegatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  amountWei: bigint;
};

export function useSvInitiateDelegatorRegistration(): UseMutationResult<{ hash: Hex; validationID: Hex }, Error, SvInitiateDelegatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateDelegatorRegistration(client, contract, params.nodeId, params.amountWei);
    },
  });
}

export type SvCompleteDelegatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  rpcUrl: string;
  bypassToken?: string;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteDelegatorRegistration(): UseMutationResult<Hex, Error, SvCompleteDelegatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteDelegatorRegistration(
        client, contract, client, params.initiateTxHash, params.rpcUrl, params.bypassToken,
        params.onProgress,
      );
    },
  });
}

export type SvCompleteDelegatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  delegationIDs?: Hex[];
  onProgress?: (msg: string) => void;
};

export function useSvCompleteDelegatorRemoval(): UseMutationResult<void, Error, SvCompleteDelegatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteDelegatorRemoval(
        client, contract, client, params.initiateRemovalTxHash, params.delegationIDs, params.onProgress,
      );
    },
  });
}

export type SvClaimOperatorFeesParams = {
  contractAddress: Address;
};

export function useSvClaimOperatorFees(): UseMutationResult<Hex, Error, SvClaimOperatorFeesParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svClaimOperatorFees(contract);
    },
  });
}

// ── Read hooks ────────────────────────────────────────────────────────────────

const REFETCH_INTERVAL = 12_000;

export type SvOperatorInfo = {
  active: boolean;
  allocationBips: bigint;
  activeStake: bigint;
  accruedFees: bigint;
  feeRecipient: Address;
};

export type StakingValidatorInfo = {
  owner: Address;
  delegationFeeBips: number;
  minStakeDuration: bigint;
  uptimeSeconds: bigint;
  lastRewardClaimTime: bigint;
  lastClaimUptimeSeconds: bigint;
};

export type ValidatorInfo = {
  status: number;
  nodeID: Hex;
  startingWeight: bigint;
  sentNonce: bigint;
  receivedNonce: bigint;
  weight: bigint;
  startTime: bigint;
  endTime: bigint;
};

export type DelegatorInfo = {
  status: number;
  owner: Address;
  validationID: Hex;
  weight: bigint;
  startTime: bigint;
  startingNonce: bigint;
  endingNonce: bigint;
  lastRewardClaimTime: bigint;
  lastClaimUptimeSeconds: bigint;
};

export type WithdrawalRequest = {
  id: bigint;
  user: Address;
  shares: bigint;
  stakeAmount: bigint;
  requestEpoch: bigint;
  fulfilled: boolean;
  claimable: boolean | undefined;
};

export type VaultState = {
  currentEpoch: bigint | undefined;
  epochDuration: bigint | undefined;
  availableStake: bigint | undefined;
  queueLength: bigint | undefined;
  queueHead: bigint | undefined;
  pendingWithdrawals: bigint | undefined;
  claimableWithdrawalStake: bigint | undefined;
  startTime: bigint | undefined;
  exchangeRate: bigint | undefined;
  withdrawalRequestFee: bigint | undefined;
  paused: boolean | undefined;
};

export function useStakingManagerAddress(vaultAddress: Address | undefined) {
  const { data, ...rest } = useReadContract({
    address: vaultAddress,
    abi: StakingVaultABI,
    functionName: 'getStakingManager',
    query: { enabled: !!vaultAddress, refetchInterval: REFETCH_INTERVAL },
  });
  return { stakingManagerAddress: data as Address | undefined, ...rest };
}

export function useOperatorInfo(vaultAddress: Address | undefined, operator: Address | undefined) {
  const enabled = !!vaultAddress && !!operator;
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getOperatorInfo', args: [operator as Address] },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getOperatorCurrentEpochPendingAmount', args: [operator as Address] },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getOperatorPriorEpochPendingAmount', args: [operator as Address] },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getOperatorExitDebt', args: [operator as Address] },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getOperatorFeeBips' },
    ],
    query: { enabled, refetchInterval: REFETCH_INTERVAL },
  });
  return {
    info: data?.[0]?.result as SvOperatorInfo | undefined,
    currentPending: data?.[1]?.result as bigint | undefined,
    priorPending: data?.[2]?.result as bigint | undefined,
    exitDebt: data?.[3]?.result as bigint | undefined,
    globalFeeBips: data?.[4]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

export function useOperatorValidators(vaultAddress: Address | undefined, operator: Address | undefined) {
  const enabled = !!vaultAddress && !!operator;
  const { data, refetch } = useReadContract({
    address: vaultAddress,
    abi: StakingVaultABI,
    functionName: 'getOperatorValidators',
    args: operator ? [operator] : undefined,
    query: { enabled, refetchInterval: REFETCH_INTERVAL },
  });
  return { validatorIds: (data ?? []) as Hex[], refetch };
}

export function useOperatorDelegators(vaultAddress: Address | undefined, operator: Address | undefined) {
  const enabled = !!vaultAddress && !!operator;
  const { data, refetch } = useReadContract({
    address: vaultAddress,
    abi: StakingVaultABI,
    functionName: 'getOperatorDelegators',
    args: operator ? [operator] : undefined,
    query: { enabled, refetchInterval: REFETCH_INTERVAL },
  });
  return { delegatorIds: (data ?? []) as Hex[], refetch };
}

export function useValidatorDetails(
  validationID: Hex | undefined,
  stakingManagerAddress: Address | undefined,
  validatorManagerAddress: Address | undefined,
) {
  const enabled = !!validationID;
  const { data: staking } = useReadContract({
    address: stakingManagerAddress,
    abi: KiteStakingManagerABI,
    functionName: 'getStakingValidator',
    args: validationID ? [validationID] : undefined,
    query: { enabled: enabled && !!stakingManagerAddress },
  });
  const { data: validator } = useReadContract({
    address: validatorManagerAddress,
    abi: ValidatorManagerABI,
    functionName: 'getValidator',
    args: validationID ? [validationID] : undefined,
    query: { enabled: enabled && !!validatorManagerAddress },
  });
  return {
    staking: staking as StakingValidatorInfo | undefined,
    validator: validator as ValidatorInfo | undefined,
  };
}

export function useDelegatorDetails(
  delegationID: Hex | undefined,
  stakingManagerAddress: Address | undefined,
) {
  const { data: delegator } = useReadContract({
    address: stakingManagerAddress,
    abi: KiteStakingManagerABI,
    functionName: 'getDelegatorInfo',
    args: delegationID ? [delegationID] : undefined,
    query: { enabled: !!delegationID && !!stakingManagerAddress },
  });
  return { delegator: delegator as DelegatorInfo | undefined };
}

export function useVaultState(vaultAddress: Address | undefined): VaultState & { refetch: () => void } {
  const enabled = !!vaultAddress;
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getCurrentEpoch' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getEpochDuration' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getAvailableStake' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getWithdrawalQueueLength' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getQueueHead' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getPendingWithdrawals' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getClaimableWithdrawalStake' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getStartTime' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getExchangeRate' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'getWithdrawalRequestFee' },
      { address: vaultAddress as Address, abi: StakingVaultABI, functionName: 'paused' },
    ],
    query: { enabled, refetchInterval: REFETCH_INTERVAL },
  });
  return {
    currentEpoch: data?.[0]?.result as bigint | undefined,
    epochDuration: data?.[1]?.result as bigint | undefined,
    availableStake: data?.[2]?.result as bigint | undefined,
    queueLength: data?.[3]?.result as bigint | undefined,
    queueHead: data?.[4]?.result as bigint | undefined,
    pendingWithdrawals: data?.[5]?.result as bigint | undefined,
    claimableWithdrawalStake: data?.[6]?.result as bigint | undefined,
    startTime: data?.[7]?.result as bigint | undefined,
    exchangeRate: data?.[8]?.result as bigint | undefined,
    withdrawalRequestFee: data?.[9]?.result as bigint | undefined,
    paused: data?.[10]?.result as boolean | undefined,
    refetch,
  };
}

export function useWithdrawalRequests(vaultAddress: Address | undefined, userAddress: Address | undefined) {
  const enabled = !!vaultAddress && !!userAddress;
  const { data: ids, refetch } = useReadContract({
    address: vaultAddress,
    abi: StakingVaultABI,
    functionName: 'getWithdrawalRequestIds',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled },
  });
  const requestIds = (ids ?? []) as bigint[];
  const { data: requestsData } = useReadContracts({
    contracts: requestIds.map((id) => ({
      address: vaultAddress as Address,
      abi: StakingVaultABI,
      functionName: 'getWithdrawalRequest' as const,
      args: [id] as const,
    })),
    query: { enabled: requestIds.length > 0 },
  });
  const { data: claimablesData } = useReadContracts({
    contracts: requestIds.map((id) => ({
      address: vaultAddress as Address,
      abi: StakingVaultABI,
      functionName: 'isWithdrawalClaimable' as const,
      args: [id] as const,
    })),
    query: { enabled: requestIds.length > 0 },
  });
  const withdrawalRequests: (WithdrawalRequest | undefined)[] = requestIds.map((id, i) => {
    const req = requestsData?.[i]?.result as Omit<WithdrawalRequest, 'id' | 'claimable'> | undefined;
    if (!req) return undefined;
    return { ...req, id, claimable: claimablesData?.[i]?.result as boolean | undefined };
  });
  return { withdrawalRequests, refetch };
}
