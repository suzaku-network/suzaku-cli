import L1RegistryAbi from './abis/L1Registry';
import OperatorRegistryAbi from './abis/OperatorRegistry';
import VaultManagerAbi from './abis/MiddlewareVaultManager';
import L1MiddlewareAbi from './abis/AvalancheL1Middleware';
import VaultTokenizedAbi from './abis/VaultTokenized';
import L1RestakeDelegatorAbi from './abis/L1RestakeDelegator';
import dotenv from 'dotenv';
import BalancerValidatorManagerAbi from './abis/BalancerValidatorManager';
import VaultFactoryAbi from './abis/VaultFactory';
import OperatorVaultOptInServiceAbi from './abis/OperatorVaultOptInService';
import OperatorL1OptInServiceAbi from './abis/OperatorL1OptInService';
import UptimeTrackerAbi from './abis/UptimeTracker';
import RewardsAbi from './abis/Rewards';
import { Network } from './client';
import { Hex, Abi, getContract, PublicClient } from 'viem';

// import DelegatorFactoryAbi from './abis/DelegatorFactory.json';
// Load environment variables
dotenv.config();

const abis = {
  L1Registry: L1RegistryAbi as Abi,
  OperatorRegistry: OperatorRegistryAbi as Abi,
  VaultManager: VaultManagerAbi as Abi,
  L1Middleware: L1MiddlewareAbi as Abi,
  VaultTokenized: VaultTokenizedAbi as Abi,
  L1RestakeDelegator: L1RestakeDelegatorAbi as Abi,
  BalancerValidatorManager: BalancerValidatorManagerAbi as Abi,
  VaultFactory: VaultFactoryAbi as Abi,
  OperatorVaultOptInService: OperatorVaultOptInServiceAbi as Abi,
  OperatorL1OptInService: OperatorL1OptInServiceAbi as Abi,
  // DelegatorFactory: DelegatorFactoryAbi as Abi,
  MiddlewareService: L1MiddlewareAbi as Abi,
  UptimeTracker: UptimeTrackerAbi as Abi,
  Rewards: RewardsAbi as Abi,
};

interface Config {
  l1Registry: Hex;
  operatorRegistry: Hex;
  opL1OptIn: Hex;
  opVaultOptIn: Hex;
  abis: typeof abis;
}

const fujiConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY_FUJI as Hex) || '0xB9826Bbf0deB10cC3924449B93F418db6b16be36',
  operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as Hex) || '0x46D45D6be6214F6bd8124187caD1a5302755d7A2',
  opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as Hex) || '0x0360C1cB32A20D97b358538D9Db71339ce2c9592',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as Hex) || '0xC30c9f7482B2ED82d0532812285295f8b7453941',
  abis,
};

const anvilConfig: Config = {
  l1Registry: (process.env.L1_REGISTRY as Hex) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  operatorRegistry: (process.env.OPERATOR_REGISTRY as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  opL1OptIn: (process.env.OP_L1_OPT_IN as Hex) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
  opVaultOptIn: (process.env.OP_VAULT_OPT_IN as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  abis,
};

function getConfig(network: Network): Config {
  if (network === 'fuji') {
    return fujiConfig;
  } else if (network === 'anvil') {
    return anvilConfig;
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
}

export { Config, getConfig };
