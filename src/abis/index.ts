import L1Registry from './L1Registry';
import OperatorRegistry from './OperatorRegistry';
import VaultManager from './VaultManager';
import L1Middleware from './L1Middleware';
import VaultTokenized from './VaultTokenized';
import L1RestakeDelegator from './L1RestakeDelegator';
import BalancerValidatorManager from './BalancerValidatorManager';
import VaultFactory from './VaultFactory';
import OperatorVaultOptInService from './OperatorVaultOptInService';
import OperatorL1OptInService from './OperatorL1OptInService';
import UptimeTracker from './UptimeTracker';
import PoASecurityModule from './PoASecurityModule';
import DefaultCollateral from './DefaultCollateral';
import ERC20 from './ERC20';
import IWarpMessenger from './IWarpMessenger';
import ValidatorManager from './ValidatorManager';
import AccessControl from './AccessControl';
import RewardsNativeToken from './RewardsNativeToken';
import Ownable from './Ownable';
import KiteStakingManager from './KiteStakingManager';
import StakingVault from './StakingVault';
import StakingVaultOperations from './StakingVaultOperations';

import { Abi } from 'viem';

type ErrorItem = Extract<Abi[number], { type: 'error' }>;
type ExtractErrors<T extends Abi> = Extract<T[number], { type: 'error' }>;

export function withErrors<T extends Abi, O extends Abi[]>(base: T, ...others: [...O]): [...T, ...ExtractErrors<O[number]>[]] {
  const errors = others.flatMap(abi => abi.filter((item): item is ErrorItem => item.type === 'error'));
  return [...base, ...errors] as [...T, ...ExtractErrors<O[number]>[]];
}

export const SuzakuABI = {
  L1Registry,
  OperatorRegistry,
  VaultManager,
  L1Middleware: withErrors(L1Middleware, L1Registry, OperatorRegistry, VaultManager, BalancerValidatorManager, ValidatorManager),
  VaultTokenized,
  L1RestakeDelegator,
  BalancerValidatorManager,
  VaultFactory,
  OperatorVaultOptInService,
  OperatorL1OptInService,
  UptimeTracker,
  PoASecurityModule,
  DefaultCollateral,
  ERC20,
  IWarpMessenger,
  ValidatorManager,
  AccessControl,
  RewardsNativeToken,
  Ownable,
  KiteStakingManager,
  StakingVault: withErrors(StakingVault, StakingVaultOperations, KiteStakingManager, ValidatorManager),
  StakingVaultOperations
};
