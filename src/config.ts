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
export interface Config<T extends ExtendedClient> {
  abis: TSuzakuABI;
  contracts: CurriedSuzakuContractMap<T>;
  client: T;
}

export function getConfig<T extends ExtendedClient>(client: T, waitForTxCount = 0, skipAbiValidation: boolean = false): Config<T> {

  // Dynamically build the contracts map using the curriedContract function
  const contracts = Object.keys(SuzakuABI).reduce((acc, name) => {
    // Keep the any to bypass type evaluation and complexity errors
    (acc as any)[name] = curriedContract(name as SuzakuABINames, client, waitForTxCount, skipAbiValidation);
    return acc;
  }, {} as CurriedSuzakuContractMap<T>);
  return {
    abis: SuzakuABI,
    contracts,
    client,
  }
}

// Constants
export const pChainChainID = '11111111111111111111111111111111LpoYY';
