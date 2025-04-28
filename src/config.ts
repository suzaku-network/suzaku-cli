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
// import DelegatorFactoryAbi from './abis/DelegatorFactory.json';

// Load environment variables
dotenv.config();

interface Config {
  l1Registry: `0x${string}`;
  operatorRegistry: `0x${string}`;
  vaultManager: `0x${string}`;
  middlewareService: `0x${string}`;
  opL1OptIn: `0x${string}`;
  opVaultOptIn: `0x${string}`;
  balancerValidatorManager: `0x${string}`;
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
  };
}

const fujiConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY_FUJI as `0x${string}`) || '0x96a7389543d84a93f2fBE90D5d09eF1B0c30F84b',
  operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as `0x${string}`) || '0xcBAf6eb3d1F557f4cFF5c2531c0689B582ce0420',
  vaultManager: (process.env.VAULT_MANAGER_FUJI as `0x${string}`) || '0xB289d0a1723a36Eba3AE4492794f81F854A7f970',
  middlewareService: (process.env.MIDDLEWARE_FUJI as `0x${string}`) || '0xde7b5222Cf6A031ee1F9595f7364162376B8C2b4',
  opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as `0x${string}`) || '0x4036D99c3a1210d669f56E7eD71816D6696c05Cb',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as `0x${string}`) || '0xA1E4764eC99fC616A69930c45651643dFC58DD0d',
  balancerValidatorManager: (process.env.BALANCER_VALIDATOR_MANAGER_FUJI as `0x${string}`) || '0x84F2B4D4cF8DA889701fBe83d127896880c04325',
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
  },
};

const anvilConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY as `0x${string}`) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  operatorRegistry: (process.env.OPERATOR_REGISTRY as `0x${string}`) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  vaultManager: (process.env.VAULT_MANAGER as `0x${string}`) || '0x712516e61C8B383dF4A63CFe83d7701Bce54B03e',
  middlewareService: (process.env.MIDDLEWARE as `0x${string}`) || '0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F',
  opL1OptIn: (process.env.OP_L1_OPT_IN as `0x${string}`) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN as `0x${string}`) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  balancerValidatorManager: (process.env.BALANCER_VALIDATOR_MANAGER as `0x${string}`) || '0x8464135c8F25Da09e49BC8782676a84730C318bC',
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
