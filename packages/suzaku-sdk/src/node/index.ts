// Node entry point — extends core with Node.js capabilities (fs, path, process)

export * from '../core/index';

export { NodeUserInteraction } from './userInteraction';
export { NodeProgress } from './progress';
export { nodeLogger, formatError } from './nodeLogger';
export type { NodeLoggerInstance } from './nodeLogger';

export { generateClient, getLedgerAccount, toSafeProvider, handleTransactionStrategy, setCustomChainRpcUrl } from './client/index';
export type { ExtendedWalletClient, ExtendedPublicClient, ExtendedClient } from './client/index';

export { setCastMode, isCastMode, logCastCall, logCastSend, logPChainIssueTx, formatCastCommand, CAST_DUMMY_HASH } from './castUtils';
export type { CastCommandOptions } from './castUtils';

export { withSafeWrite, withMulticall, curriedContract, contractAbiValidation, withGnosisSafe, withCastMode, handleContractError } from './viemUtils';
export type { SuzakuABINames, TSuzakuABI, SuzakuContract, SafeSuzakuContract, TWriteSuzakuContract, CurriedContractFn, CurriedSuzakuContractMap } from './viemUtils';

export { getConfig, pChainChainID } from './config';
export type { Config } from './config';
