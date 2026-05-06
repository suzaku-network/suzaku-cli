import { type ExtendedClient } from './client/types';
import { pChainChainID, type Config } from '../core/config';

export { pChainChainID };
export type { Config };

export function getConfig<T extends ExtendedClient>(client: T, wait = 0, skipAbiValidation = false): Config<T> {
  return { client, wait, skipAbiValidation };
}
