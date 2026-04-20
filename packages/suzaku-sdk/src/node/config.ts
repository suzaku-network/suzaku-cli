import { SuzakuABI } from '../core/abis/index';
import { type ExtendedClient } from './client/types';
import { curriedContract, type CurriedSuzakuContractMap, type SuzakuABINames, type TSuzakuABI } from './viemUtils';

export const pChainChainID = '11111111111111111111111111111111LpoYY';

export interface Config<T extends ExtendedClient> {
  abis: TSuzakuABI;
  contracts: CurriedSuzakuContractMap<T>;
  client: T;
}

export function getConfig<T extends ExtendedClient>(client: T, waitForTxCount = 0, skipAbiValidation: boolean = false): Config<T> {
  const contracts = Object.keys(SuzakuABI).reduce((acc, name) => {
    (acc as any)[name] = curriedContract(name as SuzakuABINames, client, waitForTxCount, skipAbiValidation);
    return acc;
  }, {} as CurriedSuzakuContractMap<T>);
  return { abis: SuzakuABI, contracts, client };
}
