// Core entry point — pure viem-based logic, no Node.js / React

export { logger, LogLevelEnum } from './logger/index';
export type { LogLevel, LoggerInstance, UserInteractionInterface, ProgressInterface } from './logger/index';

export { SuzakuABI, withErrors } from './abis/index';

export { chainList } from './client/index';
export type { Network, Chains, PChainAddress, Addresses, ExtendedWalletClient, ExtendedPublicClient, ExtendedClient } from './client/index';

export { withSafeWrite, withMulticall, curriedContract, contractAbiValidation, bigintReplacer, bytes32ToAddress } from './viemUtils';
export type { SuzakuABINames, TSuzakuABI, SuzakuContract, SafeSuzakuContract, TWriteSuzakuContract, CurriedContractFn, CurriedSuzakuContractMap, MulticallOptions, AbiValidationClient } from './viemUtils';
