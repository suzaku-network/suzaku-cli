// Core entry point — pure viem-based logic, no Node.js / React

export { logger, LogLevelEnum } from './logger/index';
export type { LogLevel, LoggerInstance, UserInteractionInterface, ProgressInterface } from './logger/index';

export { chainList } from './client/index';
export type { Network, Chains, PChainAddress, Addresses, ExtendedWalletClient, ExtendedPublicClient, ExtendedClient } from './client/index';

export { setCastMode, isCastMode, CAST_DUMMY_HASH, formatCastCommand, logCastCall, logCastSend, logPChainIssueTx } from './lib/castUtils';
export type { CastCommandOptions } from './lib/castUtils';

export { withSafeWrite, withMulticall, getContract, contractAbiValidation, bigintReplacer, bytes32ToAddress } from './client/viemUtils';
export type { EnhancedContract, SafeEnhancedContract, MulticallOptions, AbiValidationClient } from './client/viemUtils';

export { withErrors } from './lib/abiUtils';

export { L1RegistryABI, getL1Registry } from './L1Registry';
export { L1MiddlewareABI, getL1Middleware } from './L1Middleware';
export { VaultTokenizedABI, getVaultTokenized } from './VaultTokenized';
export { DefaultCollateralABI, getDefaultCollateral } from './DefaultCollateral';
export { ERC20ABI, getERC20 } from './ERC20';
export { L1RestakeDelegatorABI, getL1RestakeDelegator } from './L1RestakeDelegator';
export { VaultManagerABI, getVaultManager } from './VaultManager';
export { OperatorL1OptInServiceABI, getOperatorL1OptInService } from './OperatorL1OptInService';
export { OperatorRegistryABI, getOperatorRegistry } from './OperatorRegistry';
export { OperatorVaultOptInServiceABI, getOperatorVaultOptInService } from './OperatorVaultOptInService';
export { PoASecurityModuleABI, getPoASecurityModule } from './PoASecurityModule';
export { UptimeTrackerABI, getUptimeTracker } from './UptimeTracker';
export { VaultFactoryABI, getVaultFactory } from './VaultFactory';
export { BalancerValidatorManagerABI, getBalancerValidatorManager } from './BalancerValidatorManager';
export { IWarpMessengerABI, getIWarpMessenger } from './IWarpMessenger';
export { ValidatorManagerABI, getValidatorManager } from './ValidatorManager';
export { AccessControlABI, getAccessControl } from './AccessControl';
export { RewardsNativeTokenABI, getRewardsNativeToken } from './RewardsNativeToken';
export { OwnableABI, getOwnable } from './Ownable';
export { KiteStakingManagerABI, getKiteStakingManager } from './KiteStaking';
export { StakingVaultABI, getStakingVault } from './StakingVault';
export { StakingVaultOperationsABI, getStakingVaultOperations } from './StakingVaultOperations';

export { cb58ToBytes, cb58ToHex, bytesToCB58, parseNodeID, encodeNodeID, isValidPrivateKey, unpackGeneric, retryWhileError, pChainChainID } from './lib/avalancheUtils';
export type { NodeId } from './lib/avalancheUtils';

export {
  packL1ConversionMessage, subnetToL1ConversionID, marshalSubnetToL1ConversionData,
  compareNodeIDs, packWarpIntoAccessList, packL1ValidatorRegistration, packL1ValidatorWeightMessage,
  packRegisterL1ValidatorPayload, unpackRegisterL1ValidatorPayload,
  packValidationUptimeMessage, decodeWarpMessage, decodeWarpMessages,
  WarpMessageType, WarpMessageSchema,
  collectSignatures, collectSignaturesInitializeValidatorSet,
} from './lib/warpUtils';
export type { PChainOwner, PackL1ConversionMessageArgs, SubnetToL1ConversionValidatorData, SolidityValidationPeriod, WarpMessage } from './lib/warpUtils';

export { setCustomChainRpcUrl } from './client/chainList';

export { getChainId, GetContractEvents, PatchEventsTimestamp, fillEventsNodeId, blockAtTimestamp, collectEventsInRange } from './lib/cChainUtils';
export type { DecodedEvent } from './lib/cChainUtils';

export {
  add0x, issuePchainTx, createSubnet, createChain, convertToL1, registerL1Validator, removeL1Validator,
  getCurrentValidators, getValidatorsAt, validates, validatedBy, setValidatorWeight,
  extractWarpMessageFromPChainTx, getValidatorManagerInitializationArgsFromWarpTx, getSigningSubnetIdFromWarpMessage,
} from './lib/pChainUtils';
export type { GetValidatorAtObject, PChainBaseParams, CreateChainParams, ConvertToL1Params, RegisterL1ValidatorParams, RemoveL1ValidatorParams, SetValidatorWeightParams, ExtractWarpMessageFromTxParams, ExtractWarpMessageFromTxResponse, ValidatorsResponsePatched } from './lib/pChainUtils';

export { ValidatorStatusNames } from './BalancerValidatorManager/const';
export type { Validator } from './BalancerValidatorManager/types';
export { ValidatorStatus } from './BalancerValidatorManager/types';
export { GetRegistrationJustification } from './lib/justification';

export { completeValidatorRegistration, completeValidatorRemoval, completeWeightUpdate } from './securityModule/index';
export type { ISecurityModuleReader, ISecurityModuleWriter } from './securityModule/interfaces';
export type { IBalancerValidatorManagerReader } from './BalancerValidatorManager/interfaces';
