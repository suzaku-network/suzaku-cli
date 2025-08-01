import L1Registry from './L1Registry';
import OperatorRegistry from './OperatorRegistry';
import VaultManager from './MiddlewareVaultManager';
import L1Middleware from './AvalancheL1Middleware';
import VaultTokenized from './VaultTokenized';
import L1RestakeDelegator from './L1RestakeDelegator';
import BalancerValidatorManager from './BalancerValidatorManager';
import VaultFactory from './VaultFactory';
import OperatorVaultOptInService from './OperatorVaultOptInService';
import OperatorL1OptInService from './OperatorL1OptInService';
import UptimeTracker from './UptimeTracker';
import Rewards from './Rewards';
import PoASecurityModule from './PoASecurityModule';

export const SuzakuABI = {
  L1Registry,
  OperatorRegistry,
  VaultManager,
  L1Middleware,
  VaultTokenized,
  L1RestakeDelegator,
  BalancerValidatorManager,
  VaultFactory,
  OperatorVaultOptInService,
  OperatorL1OptInService,
  UptimeTracker,
  Rewards,
  PoASecurityModule
};
