import L1RegistryAbi from './abis/L1Registry.json';
import OperatorRegistryAbi from './abis/OperatorRegistry.json';
import VaultManagerAbi from './abis/MiddlewareVaultManager.json';
import L1MiddlewareAbi from './abis/AvalancheL1Middleware.json';
import VaultTokenizedAbi from './abis/VaultTokenized.json';
import L1RestakeDelegatorAbi from './abis/L1RestakeDelegator.json';
import dotenv from 'dotenv';
import BalancerValidatorManagerAbi from './abis/BalancerValidatorManager.json';
import VaultFactoryAbi from './abis/VaultFactory.json';
import OperatorVaultOptInServiceAbi from './abis/OperatorVaultOptInService.json';
import OperatorL1OptInServiceAbi from './abis/OperatorL1OptInService.json';
import UptimeTrackerAbi from './abis/UptimeTracker.json';
import RewardsAbi from './abis/Rewards.json';
// import DelegatorFactoryAbi from './abis/DelegatorFactory.json';

// Load environment variables
dotenv.config();

interface Config {
  l1Registry: `0x${string}`;
  operatorRegistry: `0x${string}`;
  opL1OptIn: `0x${string}`;
  opVaultOptIn: `0x${string}`;
  abis: {
    L1Registry: any;
    OperatorRegistry: any;
    VaultManager: any;
    L1Middleware: any;
    VaultTokenized: any;
    L1RestakeDelegator: any;
    BalancerValidatorManager: any;
    VaultFactory: any;
    OperatorVaultOptInService?: any;
    OperatorL1OptInService?: any;
    MiddlewareService: any;
    UptimeTracker: any;
    Rewards: any;
  };
}

const fujiConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY_FUJI as `0x${string}`) || '0xB9826Bbf0deB10cC3924449B93F418db6b16be36',
  operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as `0x${string}`) || '0x46D45D6be6214F6bd8124187caD1a5302755d7A2',
  opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as `0x${string}`) || '0x0360C1cB32A20D97b358538D9Db71339ce2c9592',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as `0x${string}`) || '0xC30c9f7482B2ED82d0532812285295f8b7453941',
  abis: {
    L1Registry: L1RegistryAbi,
    OperatorRegistry: OperatorRegistryAbi,
    VaultManager: VaultManagerAbi,
    L1Middleware: L1MiddlewareAbi,
    VaultTokenized: VaultTokenizedAbi,
    L1RestakeDelegator: L1RestakeDelegatorAbi,
    BalancerValidatorManager: BalancerValidatorManagerAbi,
    VaultFactory: VaultFactoryAbi,
    OperatorVaultOptInService: OperatorVaultOptInServiceAbi,
    OperatorL1OptInService: OperatorL1OptInServiceAbi,
    MiddlewareService: L1MiddlewareAbi,
    UptimeTracker: UptimeTrackerAbi,
    Rewards: RewardsAbi,
  },
};

const anvilConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY as `0x${string}`) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  operatorRegistry: (process.env.OPERATOR_REGISTRY as `0x${string}`) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  opL1OptIn: (process.env.OP_L1_OPT_IN as `0x${string}`) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN as `0x${string}`) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  abis: {
    L1Registry: L1RegistryAbi,
    OperatorRegistry: OperatorRegistryAbi,
    VaultManager: VaultManagerAbi,
    L1Middleware: L1MiddlewareAbi,
    VaultTokenized: VaultTokenizedAbi,
    L1RestakeDelegator: L1RestakeDelegatorAbi,
    BalancerValidatorManager: BalancerValidatorManagerAbi,
    VaultFactory: VaultFactoryAbi,
    OperatorVaultOptInService: OperatorVaultOptInServiceAbi,
    OperatorL1OptInService: OperatorL1OptInServiceAbi,
    MiddlewareService: L1MiddlewareAbi,
    UptimeTracker: UptimeTrackerAbi,
    Rewards: RewardsAbi,
  },
};

function getConfig(network: string): Config {
  if (network === 'fuji') {
    return fujiConfig;
  } else if (network === 'anvil') {
    return anvilConfig;
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
}

export { Config, getConfig };
