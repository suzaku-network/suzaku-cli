import { SuzakuABI } from './abis';
import { ExtendedClient } from './client';
import { Hex } from 'viem';
import { curriedContract, CurriedSuzakuContractMap, SuzakuABINames, TSuzakuABI } from './lib/viemUtils';
import dotenv from 'dotenv';
import * as os from 'os';

// Load environment variables
dotenv.config();

export const confPath = os.homedir() + '/.suzaku-cli'

// Define the configuration interface
export interface Config {
  l1Registry: Hex;
  operatorRegistry: Hex;
  opL1OptIn: Hex;
  opVaultOptIn: Hex;
  abis: TSuzakuABI;
  contracts: CurriedSuzakuContractMap;
  client: ExtendedClient;
}

export function getConfig(client: ExtendedClient, waitForTxCount = 0, skipAbiValidation: boolean = false): Config {

  // Dynamically build the contracts map using the curriedContract function
  const contracts = Object.fromEntries(
    (Object.keys(SuzakuABI) as SuzakuABINames[]).map((name) => [
      name,
      curriedContract(name, client, waitForTxCount, skipAbiValidation),
    ]),
  ) as CurriedSuzakuContractMap;

  if (client.network === 'fuji') {
    return {
      l1Registry: (process.env.L1_REGISTRY_FUJI as Hex) || '0xB9826Bbf0deB10cC3924449B93F418db6b16be36',
      operatorRegistry: (process.env.OPERATOR_REGISTRY_FUJI as Hex) || '0x46D45D6be6214F6bd8124187caD1a5302755d7A2',
      opL1OptIn: (process.env.OP_L1_OPT_IN_FUJI as Hex) || '0x0360C1cB32A20D97b358538D9Db71339ce2c9592',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN_FUJI as Hex) || '0xC30c9f7482B2ED82d0532812285295f8b7453941',
      abis: SuzakuABI,
      contracts,
      client,
    };
  } else if (client.network === 'anvil') {
    return {
      l1Registry: (process.env.L1_REGISTRY as Hex) || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      operatorRegistry: (process.env.OPERATOR_REGISTRY as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      opL1OptIn: (process.env.OP_L1_OPT_IN as Hex) || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN as Hex) || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      abis: SuzakuABI,
      contracts,
      client,
    };
  } else if (client.network === 'mainnet') {
    return {
      l1Registry: (process.env.L1_REGISTRY_MAINNET as Hex) || '0xaA59b19A7636bf6d821aA124A14eEE6C92746110',
      operatorRegistry: (process.env.OPERATOR_REGISTRY_MAINNET as Hex) || '0xCccb4eC6408bF2c9D057d63DAB01E55BB536936e',
      opL1OptIn: (process.env.OP_L1_OPT_IN_MAINNET as Hex) || '0x48a990A31EC2B994A54f248BFD560954991Fa574',
      opVaultOptIn: (process.env.OP_VAULT_OPT_IN_MAINNET as Hex) || '0xE437b5EFA4c0717Ec15ACED13a82bBd8ce92da47',
      abis: SuzakuABI,
      contracts,
      client,
    };
  } else {
    throw new Error(`Unsupported network: ${client.network}`);
  }
}

// Constants
export const pChainChainID = '11111111111111111111111111111111LpoYY';
