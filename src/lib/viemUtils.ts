export { setCastMode, isCastMode, withSafeWrite, withMulticall, getContract, contractAbiValidation } from '@suzaku-sdk/node';
export type { EnhancedContract, SafeEnhancedContract } from '@suzaku-sdk/node';

import type { EnhancedContract, SafeEnhancedContract } from '@suzaku-sdk/node';
import type { ExtendedClient, ExtendedWalletClient } from '@suzaku-sdk/node';
import type { Address } from 'viem';
import {
  L1MiddlewareABI, L1RegistryABI, VaultTokenizedABI, DefaultCollateralABI,
  ERC20ABI, L1RestakeDelegatorABI, VaultManagerABI, OperatorL1OptInServiceABI,
  OperatorRegistryABI, OperatorVaultOptInServiceABI, PoASecurityModuleABI, UptimeTrackerABI,
  VaultFactoryABI, BalancerValidatorManagerABI, IWarpMessengerABI, ValidatorManagerABI,
  AccessControlABI, RewardsNativeTokenABI, OwnableABI, KiteStakingManagerABI, StakingVaultABI,
  StakingVaultOperationsABI,
} from '@suzaku-sdk/core';

type SuzakuABIRecord = {
  L1Middleware: typeof L1MiddlewareABI;
  L1Registry: typeof L1RegistryABI;
  VaultTokenized: typeof VaultTokenizedABI;
  DefaultCollateral: typeof DefaultCollateralABI;
  ERC20: typeof ERC20ABI;
  L1RestakeDelegator: typeof L1RestakeDelegatorABI;
  VaultManager: typeof VaultManagerABI;
  OperatorL1OptInService: typeof OperatorL1OptInServiceABI;
  OperatorRegistry: typeof OperatorRegistryABI;
  OperatorVaultOptInService: typeof OperatorVaultOptInServiceABI;
  PoASecurityModule: typeof PoASecurityModuleABI;
  UptimeTracker: typeof UptimeTrackerABI;
  VaultFactory: typeof VaultFactoryABI;
  BalancerValidatorManager: typeof BalancerValidatorManagerABI;
  IWarpMessenger: typeof IWarpMessengerABI;
  ValidatorManager: typeof ValidatorManagerABI;
  AccessControl: typeof AccessControlABI;
  RewardsNativeToken: typeof RewardsNativeTokenABI;
  Ownable: typeof OwnableABI;
  KiteStakingManager: typeof KiteStakingManagerABI;
  StakingVault: typeof StakingVaultABI;
  StakingVaultOperations: typeof StakingVaultOperationsABI;
};

export type SuzakuABINames = keyof SuzakuABIRecord;
export type TSuzakuABI = SuzakuABIRecord;

export type SuzakuContract = {
  [K in SuzakuABINames]: EnhancedContract<SuzakuABIRecord[K], ExtendedClient>
};

export type TWriteSuzakuContract = {
  [K in SuzakuABINames]: SafeEnhancedContract<SuzakuABIRecord[K], ExtendedWalletClient> extends { write: infer W } ? W : never
};

export type SafeSuzakuContract = {
  [K in SuzakuABINames]: SafeEnhancedContract<SuzakuABIRecord[K], ExtendedWalletClient>
};

export type CurriedContractFn<K extends SuzakuABINames, C extends ExtendedClient> =
  (address?: Address) => Promise<C extends ExtendedWalletClient ? SafeSuzakuContract[K] : SuzakuContract[K]>;

export type CurriedSuzakuContractMap<C extends ExtendedClient> = {
  [K in SuzakuABINames]: CurriedContractFn<K, C>
};
