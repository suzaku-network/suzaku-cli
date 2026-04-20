// Node entry point — extends core with Node.js capabilities (fs, path, process)

export * from '../core/index';

export { NodeUserInteraction } from './userInteraction';
export { NodeProgress } from './progress';
export { nodeLogger, formatError } from './nodeLogger';
export type { NodeLoggerInstance } from './nodeLogger';

export { generateClient, getLedgerAccount, toSafeProvider, handleTransactionStrategy, setCustomChainRpcUrl } from './client/index';
export type { ExtendedWalletClient, ExtendedPublicClient, ExtendedClient } from './client/index';
