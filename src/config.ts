import { SuzakuABI } from './abis';
import { Network } from './client';
import { Hex, PublicClient, WalletClient } from 'viem';
import { curriedContract, CurriedSuzakuContractMap, SuzakuABINames, TSuzakuABI } from './lib/viemUtils';
import dotenv from 'dotenv';
import * as os from 'os';

// Load environment variables
dotenv.config();

export const confPath =os.homedir()+'/.suzaku-cli'

// Define the configuration interface
interface Config {
  l1Registry: Hex;
  operatorRegistry: Hex;
  opL1OptIn: Hex;
  opVaultOptIn: Hex;
  abis: TSuzakuABI;
  contracts: CurriedSuzakuContractMap;
}

// Overloaded function to get the configuration based on the network and client type
function getConfig(network: Network, client: PublicClient): Config
function getConfig(network: Network, client: WalletClient): Config
function getConfig(network: Network, client: PublicClient | WalletClient): Config {

  // Dynamically build the contracts map using the curriedContract function
  const contracts = Object.fromEntries(
    (Object.keys(SuzakuABI) as SuzakuABINames[]).map((name) => [
      name,
      curriedContract(name, client),
    ]),
  ) as CurriedSuzakuContractMap;

  if (network === 'fuji') {
    return {
      l1Registry: (process.env.L1_REGISTRY_FUJI as Hex) || '0xB9826Bbf0deB10cC3924449B93F418db6b16be36',
      operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as Hex) || '0x46D45D6be6214F6bd8124187caD1a5302755d7A2',
      opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as Hex) || '0x0360C1cB32A20D97b358538D9Db71339ce2c9592',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as Hex) || '0xC30c9f7482B2ED82d0532812285295f8b7453941',
      abis: SuzakuABI,
      contracts,
    };
  } else if (network === 'anvil') {
    return {
      l1Registry: (process.env.L1_REGISTRY as Hex) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      operatorRegistry: (process.env.OPERATOR_REGISTRY as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      opL1OptIn: (process.env.OP_L1_OPT_IN as Hex) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      abis: SuzakuABI,
      contracts,
    };
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
}

export { Config, getConfig };

// Constants
export const pChainChainID = '11111111111111111111111111111111LpoYY';
