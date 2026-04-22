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

export { getAddresses, getCchainAddress, retryWhileError } from './avalancheUtils';

export { collectSignatures, collectSignaturesInitializeValidatorSet } from './warpUtils';

export {
    pChainImport, requirePChainBallance, requireCChainBallance, getERC20Events,
} from './transferUtils';

export {
    createSubnet, createChain, convertToL1, registerL1Validator, removeL1Validator,
    getCurrentValidators, getValidatorsAt, validates, validatedBy, setValidatorWeight,
    increasePChainValidatorBalance, extractWarpMessageFromPChainTx, convertSubnetToL1,
    getValidatorManagerInitializationArgsFromWarpTx, issuePchainTx, getSigningSubnetIdFromWarpMessage,
    add0x,
} from './pChainUtils';
export type {
    GetValidatorAtObject, PChainBaseParams, CreateChainParams, ConvertToL1Params,
    RegisterL1ValidatorParams, RemoveL1ValidatorParams, SetValidatorWeightParams,
    ExtractWarpMessageFromTxParams, ExtractWarpMessageFromTxResponse, ValidatorsResponsePatched,
} from './pChainUtils';

export { GetContractEvents } from './cChainUtils';
