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
import { Hex, Abi, getContract, PublicClient, GetContractReturnType, Address, WalletClient, Transport } from 'viem';

export type TContract = {
  L1Registry: GetContractReturnType<typeof L1RegistryAbi, PublicClient | WalletClient>;
  OperatorRegistry: GetContractReturnType<typeof OperatorRegistryAbi, PublicClient | WalletClient>;
  VaultManager: GetContractReturnType<typeof VaultManagerAbi, PublicClient | WalletClient>;
  L1Middleware: GetContractReturnType<typeof L1MiddlewareAbi, PublicClient | WalletClient>;
  VaultTokenized: GetContractReturnType<typeof VaultTokenizedAbi, PublicClient | WalletClient>;
  L1RestakeDelegator: GetContractReturnType<typeof L1RestakeDelegatorAbi, PublicClient | WalletClient>;
  BalancerValidatorManager: GetContractReturnType<typeof BalancerValidatorManagerAbi, PublicClient | WalletClient>;
  VaultFactory: GetContractReturnType<typeof VaultFactoryAbi, PublicClient | WalletClient>;
  OperatorVaultOptInService: GetContractReturnType<typeof OperatorVaultOptInServiceAbi, PublicClient | WalletClient>;
  OperatorL1OptInService: GetContractReturnType<typeof OperatorL1OptInServiceAbi, PublicClient | WalletClient>;
  // DelegatorFactory: GetContractReturnType<typeof DelegatorFactoryAbi, PublicClient | WalletClient>;
  MiddlewareService: GetContractReturnType<typeof L1MiddlewareAbi, PublicClient | WalletClient>; // Assuming MiddlewareService is the same as L1Middleware
  UptimeTracker: GetContractReturnType<typeof UptimeTrackerAbi, PublicClient | WalletClient>;
  Rewards: GetContractReturnType<typeof RewardsAbi, PublicClient | WalletClient>;
};

// Define a curried function to create a contract instance progressively (generic to keep type inference)
type CurriedContractFn<TABI extends Abi, TClient extends PublicClient | WalletClient> = (address: Address) => GetContractReturnType<TABI, TClient>

const curriedContract = <TABI extends Abi, TClient extends PublicClient | WalletClient>(abi: TABI, client: TClient): CurriedContractFn<TABI, TClient> => (address: Address) => getContract({ abi, address, client })


// import DelegatorFactoryAbi from './abis/DelegatorFactory.json';
// Load environment variables
dotenv.config();

interface Config {
  l1Registry: Hex;
  operatorRegistry: Hex;
  opL1OptIn: Hex;
  opVaultOptIn: Hex;
  contracts: {
    L1Registry: CurriedContractFn<typeof L1RegistryAbi, PublicClient | WalletClient>;
    OperatorRegistry: CurriedContractFn<typeof OperatorRegistryAbi, PublicClient | WalletClient>;
    VaultManager: CurriedContractFn<typeof VaultManagerAbi, PublicClient | WalletClient>;
    L1Middleware: CurriedContractFn<typeof L1MiddlewareAbi, PublicClient | WalletClient>;
    VaultTokenized: CurriedContractFn<typeof VaultTokenizedAbi, PublicClient | WalletClient>;
    L1RestakeDelegator: CurriedContractFn<typeof L1RestakeDelegatorAbi, PublicClient | WalletClient>;
    BalancerValidatorManager: CurriedContractFn<typeof BalancerValidatorManagerAbi, PublicClient | WalletClient>;
    VaultFactory: CurriedContractFn<typeof VaultFactoryAbi, PublicClient | WalletClient>;
    OperatorVaultOptInService: CurriedContractFn<typeof OperatorVaultOptInServiceAbi, PublicClient | WalletClient>;
    OperatorL1OptInService: CurriedContractFn<typeof OperatorL1OptInServiceAbi, PublicClient | WalletClient>;
    // DelegatorFactory: CurriedContractFn<typeof DelegatorFactoryAbi, PublicClient | WalletClient>;
    MiddlewareService: CurriedContractFn<typeof L1MiddlewareAbi, PublicClient | WalletClient>; // Assuming MiddlewareService is the same as L1Middleware
    UptimeTracker: CurriedContractFn<typeof UptimeTrackerAbi, PublicClient | WalletClient>;
    Rewards: CurriedContractFn<typeof RewardsAbi, PublicClient | WalletClient>;
  };
}

function getConfig(network: Network, client: PublicClient): Config
function getConfig(network: Network, client: WalletClient): Config
function getConfig(network: Network, client: PublicClient | WalletClient): Config {
  const contracts = {
    L1Registry: curriedContract(L1RegistryAbi, client),
    OperatorRegistry: curriedContract(OperatorRegistryAbi, client),
    VaultManager: curriedContract(VaultManagerAbi, client),
    L1Middleware: curriedContract(L1MiddlewareAbi, client),
    VaultTokenized: curriedContract(VaultTokenizedAbi, client),
    L1RestakeDelegator: curriedContract(L1RestakeDelegatorAbi, client),
    BalancerValidatorManager: curriedContract(BalancerValidatorManagerAbi, client),
    VaultFactory: curriedContract(VaultFactoryAbi, client),
    OperatorVaultOptInService: curriedContract(OperatorVaultOptInServiceAbi, client),
    OperatorL1OptInService: curriedContract(OperatorL1OptInServiceAbi, client),
    // DelegatorFactory: curriedContract(DelegatorFactoryAbi, client),
    MiddlewareService: curriedContract(L1MiddlewareAbi, client), // Assuming MiddlewareService is the same as L1Middleware
    UptimeTracker: curriedContract(UptimeTrackerAbi, client),
    Rewards: curriedContract(RewardsAbi, client),
  };
  
  if (network === 'fuji') {
    return {
      l1Registry: (process.env.L1_REGISTRY_FUJI as Hex) || '0xB9826Bbf0deB10cC3924449B93F418db6b16be36',
      operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as Hex) || '0x46D45D6be6214F6bd8124187caD1a5302755d7A2',
      opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as Hex) || '0x0360C1cB32A20D97b358538D9Db71339ce2c9592',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as Hex) || '0xC30c9f7482B2ED82d0532812285295f8b7453941',
      contracts,
    };
  } else if (network === 'anvil') {
    return {
      l1Registry: (process.env.L1_REGISTRY as Hex) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      operatorRegistry: (process.env.OPERATOR_REGISTRY as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      opL1OptIn: (process.env.OP_L1_OPT_IN as Hex) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      contracts,
    };
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
}

export { Config, getConfig };
