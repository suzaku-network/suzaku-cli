import { type ExtendedClient } from './client/types';

export { pChainChainID } from './lib/avalancheUtils';

export interface Config<T extends ExtendedClient> {
  client: T;
  wait?: number;
  skipAbiValidation?: boolean;
}
