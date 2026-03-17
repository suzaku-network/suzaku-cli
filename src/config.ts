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
    return {
      abis: SuzakuABI,
      contracts,
      client,
    }
}

// Constants
export const pChainChainID = '11111111111111111111111111111111LpoYY';
