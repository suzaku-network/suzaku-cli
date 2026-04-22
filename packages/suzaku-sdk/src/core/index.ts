// Core entry point — pure viem-based logic, no Node.js / React

export { logger, LogLevelEnum } from './logger/index';
export type { LogLevel, LoggerInstance, UserInteractionInterface, ProgressInterface } from './logger/index';

export { SuzakuABI, withErrors } from './abis/index';

export { chainList } from './client/index';
export type { Network, Chains, PChainAddress, Addresses, ExtendedWalletClient, ExtendedPublicClient, ExtendedClient } from './client/index';

export { setCastMode, isCastMode, CAST_DUMMY_HASH, formatCastCommand, logCastCall, logCastSend, logPChainIssueTx } from './castUtils';
export type { CastCommandOptions } from './castUtils';

export { withSafeWrite, withMulticall, curriedContract, contractAbiValidation, bigintReplacer, bytes32ToAddress } from './viemUtils';
export type { SuzakuABINames, TSuzakuABI, SuzakuContract, SafeSuzakuContract, TWriteSuzakuContract, CurriedContractFn, CurriedSuzakuContractMap, MulticallOptions, AbiValidationClient } from './viemUtils';

export { cb58ToBytes, cb58ToHex, bytesToCB58, parseNodeID, encodeNodeID, isValidPrivateKey, unpackGeneric, retryWhileError, pChainChainID } from './avalancheUtils';
export type { NodeId } from './avalancheUtils';

export {
    packL1ConversionMessage, subnetToL1ConversionID, marshalSubnetToL1ConversionData,
    compareNodeIDs, packWarpIntoAccessList, packL1ValidatorRegistration, packL1ValidatorWeightMessage,
    packRegisterL1ValidatorPayload, unpackRegisterL1ValidatorPayload,
    packValidationUptimeMessage, decodeWarpMessage, decodeWarpMessages,
    WarpMessageType, WarpMessageSchema,
    collectSignatures, collectSignaturesInitializeValidatorSet,
} from './warpUtils';
export type { PChainOwner, PackL1ConversionMessageArgs, SubnetToL1ConversionValidatorData, SolidityValidationPeriod, WarpMessage } from './warpUtils';

export { setCustomChainRpcUrl } from './client/chainList';

export { getChainId, GetContractEvents, PatchEventsTimestamp, fillEventsNodeId, blockAtTimestamp, collectEventsInRange } from './cChainUtils';
export type { DecodedEvent } from './cChainUtils';

export {
    add0x, issuePchainTx, createSubnet, createChain, convertToL1, registerL1Validator, removeL1Validator,
    getCurrentValidators, getValidatorsAt, validates, validatedBy, setValidatorWeight,
    extractWarpMessageFromPChainTx, getValidatorManagerInitializationArgsFromWarpTx, getSigningSubnetIdFromWarpMessage,
} from './pChainUtils';
export type { GetValidatorAtObject, PChainBaseParams, CreateChainParams, ConvertToL1Params, RegisterL1ValidatorParams, RemoveL1ValidatorParams, SetValidatorWeightParams, ExtractWarpMessageFromTxParams, ExtractWarpMessageFromTxResponse, ValidatorsResponsePatched, Validator } from './pChainUtils';
