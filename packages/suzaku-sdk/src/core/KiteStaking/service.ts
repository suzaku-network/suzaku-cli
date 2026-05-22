import { bytesToHex, hexToBytes, fromBytes, parseEventLogs, type Hex, type Address } from 'viem';
import { pipe, R } from '@mobily/ts-belt';
import { utils } from '@avalabs/avalanchejs';
import type { IContract } from '../client/contract';
import type { ExtendedWalletClient } from '../client/types';
import type { TKiteStakingManagerABI } from './abi';
import KiteStakingManagerABI from './abi';
import ValidatorManagerABI from '../ValidatorManager/abi';
import { IWarpMessengerABI } from '../IWarpMessenger';
import { getValidatorManager } from '../ValidatorManager';
import { encodeNodeID, parseNodeID, retryWhileError, cb58ToHex, pChainChainID, type NodeId } from '../lib/avalancheUtils';
import { packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList, collectSignatures } from '../lib/warpUtils';
import { getSigningSubnetIdFromWarpMessage, getCurrentValidators, registerL1Validator, setValidatorWeight } from '../lib/pChainUtils';
import { GetRegistrationJustification } from '../lib/justification';
import { getValidationUptimeMessage, getCurrentValidatorsFromNode } from '../UptimeTracker/service';
import { logger } from '../logger';

type PChainOwnerOptions = {
  threshold?: number;
  addresses?: Hex[];
};

export async function ksmInitiateValidatorRegistration(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'initiateValidatorRegistration'>,
  nodeId: NodeId,
  blsKey: Hex,
  delegationFeeBips: number,
  minStakeDuration: bigint,
  rewardRecipient: Address,
  stakeAmountWei: bigint,
  remainingBalanceOwner?: PChainOwnerOptions,
  disableOwner?: PChainOwnerOptions,
): Promise<Hex> {
  const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex') as Hex;
  const remainingAddresses = remainingBalanceOwner?.addresses?.length ? remainingBalanceOwner.addresses : [defaultOwnerAddress];
  const disableAddresses = disableOwner?.addresses?.length ? disableOwner.addresses : [defaultOwnerAddress];
  const nodeIdBytes = parseNodeID(nodeId, false);
  return kiteStakingManager.safeWrite.initiateValidatorRegistration(
    [
      nodeIdBytes,
      blsKey,
      { threshold: remainingBalanceOwner?.threshold ?? 1, addresses: remainingAddresses },
      { threshold: disableOwner?.threshold ?? 1, addresses: disableAddresses },
      delegationFeeBips,
      minStakeDuration,
      rewardRecipient,
    ],
    { value: stakeAmountWei, chain: null },
  );
}

export async function ksmCompleteValidatorRegistration(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'completeValidatorRegistration'>,
  pchainClient: ExtendedWalletClient,
  initiateTxHash: Hex,
  blsProofOfPossession: Hex,
  initialBalance: bigint,
  waitValidatorVisible = true,
  onProgress?: (msg: string) => void,
): Promise<Hex> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/5: Parsing initiate transaction receipt...');
  let validationIDHex: Hex;
  let nodeId: string;
  let subnetID: string;
  let signingSubnetId: string;
  let warpMessage: Hex;
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });
    const initiatedStakingRegistration = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedStakingValidatorRegistration' })[0];
    if (!initiatedStakingRegistration) throw new Error('No InitiatedStakingValidatorRegistration event found in the transaction logs, verify the transaction hash.');
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await getValidatorManager(client, settings.manager);
    const initiatedValidatorRegistration = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRegistration' })[0];
    if (!initiatedValidatorRegistration) throw new Error('No InitiatedValidatorRegistration event found in the transaction logs, verify the transaction hash.');
    const warpLog = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs })[0];
    if (!warpLog) throw new Error('No IWarpMessenger event found in the transaction logs.');
    validationIDHex = initiatedValidatorRegistration.args.validationID as Hex;
    nodeId = encodeNodeID(initiatedValidatorRegistration.args.nodeID as Hex);
    warpMessage = warpLog.args.message as Hex;
    signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpMessage);
    const subnetIDHex = await validatorManager.read.subnetID();
    subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  } catch (error) {
    throw new Error(`[ksmCompleteValidatorRegistration] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 1/5: Done. validationID=${validationIDHex}, nodeId=${nodeId}`);

  progress('Step 2/5: Checking P-Chain registration status...');
  let isAlreadyRegistered: boolean;
  try {
    isAlreadyRegistered = (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId);
  } catch (error) {
    throw new Error(`[ksmCompleteValidatorRegistration] Step 2 failed — checkPChainRegistration: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 2/5: Done. Already registered: ${isAlreadyRegistered}`);

  if (isAlreadyRegistered) {
    progress('Step 3/5: Skipped — validator already on P-Chain.');
  } else {
    progress('Step 3/5: Collecting warp signatures and registering on P-Chain...');
    let pChainTxId = '';
    try {
      const signedMessage = await collectSignatures({ network: client.network, message: warpMessage, signingSubnetId });
      pipe(
        await registerL1Validator({ client: pchainClient, blsProofOfPossession, signedMessage, initialBalance }),
        R.tap(txId => { pChainTxId = txId; }),
        R.tapError(err => { throw new Error(String(err)); }),
      );
    } catch (error) {
      throw new Error(`[ksmCompleteValidatorRegistration] Step 3 failed — registerOnPChain: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`Step 3/5: Done. P-Chain txID=${pChainTxId}`);
  }

  progress('Step 4/5: Aggregating P-Chain warp signatures...');
  let signedPChainMessage: string;
  try {
    const validationIDBytes = hexToBytes(validationIDHex);
    const networkID = client.network === 'fuji' ? 5 : 1;
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, networkID, pChainChainID);
    signedPChainMessage = await collectSignatures({ network: client.network, message: bytesToHex(unsignedPChainWarpMsg), signingSubnetId });
  } catch (error) {
    throw new Error(`[ksmCompleteValidatorRegistration] Step 4 failed — collectPChainSignatures: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress('Step 4/5: Done.');

  progress('Step 5/5: Submitting completeValidatorRegistration on C-Chain...');
  let hash: Hex;
  try {
    const accessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainMessage}`));
    hash = await kiteStakingManager.safeWrite.completeValidatorRegistration([0], { chain: null, accessList });
    if (waitValidatorVisible) {
      progress('Step 5/5: Waiting for validator to be visible on P-Chain...');
      await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId), 5000, 180000, res => res === true);
    }
  } catch (error) {
    throw new Error(`[ksmCompleteValidatorRegistration] Step 5 failed — submitComplete: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 5/5: Done. tx hash=${hash}`);

  return hash;
}

export async function ksmInitiateDelegatorRegistration(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'initiateDelegatorRegistration'>,
  nodeId: NodeId,
  rewardRecipient: Address,
  stakeAmountWei: bigint,
): Promise<Hex> {
  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);
  const nodeIdBytes = parseNodeID(nodeId, false);
  const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
  return kiteStakingManager.safeWrite.initiateDelegatorRegistration([validationID, rewardRecipient], { value: stakeAmountWei, chain: null });
}

export async function ksmCompleteDelegatorRegistration(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'completeDelegatorRegistration'>,
  pchainClient: ExtendedWalletClient,
  initiateTxHash: Hex,
  rpcUrl: string,
  onProgress?: (msg: string) => void,
): Promise<Hex> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/4: Parsing delegator registration receipt...');
  let delegationID: Hex;
  let validationID: Hex;
  let validatorWeight: bigint;
  let nonce: bigint;
  let nodeId: string;
  let signingSubnetId: string;
  let weightWarpMessage: Hex;
  let networkID: number;
  let sourceChainID: string;
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await getValidatorManager(client, settings.manager);
    const initiatedDelegatorRegistration = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedDelegatorRegistration' })[0];
    if (!initiatedDelegatorRegistration) throw new Error('No InitiatedDelegatorRegistration event found in the transaction logs, verify the transaction hash.');
    delegationID = initiatedDelegatorRegistration.args.delegationID as Hex;
    validationID = initiatedDelegatorRegistration.args.validationID as Hex;
    validatorWeight = BigInt(initiatedDelegatorRegistration.args.validatorWeight);
    nonce = BigInt(initiatedDelegatorRegistration.args.nonce);
    const setWeightMessageID = initiatedDelegatorRegistration.args.setWeightMessageID;
    const validator = await validatorManager.read.getValidator([validationID]);
    nodeId = encodeNodeID(validator.nodeID as Hex);
    const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
    signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs[0].args.message);
    const weightWarpLog = warpLogs.find(w => w.args.messageID === setWeightMessageID);
    if (!weightWarpLog) throw new Error('No matching warp message found for setWeightMessageID, verify the transaction hash.');
    weightWarpMessage = weightWarpLog.args.message as Hex;
    networkID = client.network === 'fuji' ? 5 : 1;
    sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID as Hex));
  } catch (error) {
    throw new Error(`[ksmCompleteDelegatorRegistration] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 1/4: Done. delegationID=${delegationID}, nodeId=${nodeId}`);

  progress('Step 2/4: Setting validator weight on P-Chain...');
  let weightSkipped = false;
  try {
    const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: weightWarpMessage, signingSubnetId });
    pipe(
      await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
      R.tap(txId => { progress(`Step 2/4: Done. P-Chain txID=${txId}`); }),
      R.tapError(err => {
        if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
        weightSkipped = true;
      }),
    );
  } catch (error) {
    throw new Error(`[ksmCompleteDelegatorRegistration] Step 2 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (weightSkipped) progress('Step 2/4: Skipped — weight already set (stale nonce).');

  progress('Step 3/4: Collecting P-Chain weight signatures and uptime message...');
  let signedPChainWeightMessage: string;
  let signedUptimeMessageHex: Hex;
  try {
    const validationIDBytes = hexToBytes(validationID);
    const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, nonce, validatorWeight, networkID, pChainChainID);
    signedPChainWeightMessage = await collectSignatures({ network: client.network, message: bytesToHex(unsignedPChainWeightWarpMsg), signingSubnetId });
    const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID);
    signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;
  } catch (error) {
    throw new Error(`[ksmCompleteDelegatorRegistration] Step 3 failed — collectSignaturesAndUptime: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress('Step 3/4: Done.');

  progress('Step 4/4: Submitting completeDelegatorRegistration on C-Chain...');
  let hash: Hex;
  try {
    const weightAccessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainWeightMessage}`));
    const uptimeAccessList = packWarpIntoAccessList(hexToBytes(signedUptimeMessageHex));
    const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]];
    hash = await kiteStakingManager.safeWrite.completeDelegatorRegistration([delegationID, 0, 1], { chain: null, accessList: combinedAccessList });
  } catch (error) {
    throw new Error(`[ksmCompleteDelegatorRegistration] Step 4 failed — submitComplete: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 4/4: Done. tx hash=${hash}`);

  return hash;
}

export async function ksmInitiateDelegatorRemoval(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'getDelegatorInfo' | 'initiateDelegatorRemoval'>,
  delegationID: Hex,
  includeUptimeProof: boolean,
  rpcUrl?: string,
): Promise<Hex> {
  let accessList: Array<{ address: Hex; storageKeys: Hex[] }> | undefined;

  if (includeUptimeProof) {
    if (!rpcUrl) throw new Error('RPC URL is required when includeUptimeProof is true.');
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await getValidatorManager(client, settings.manager);
    const delegatorInfo = await kiteStakingManager.read.getDelegatorInfo([delegationID]);
    const validator = await validatorManager.read.getValidator([delegatorInfo.validationID]);
    const nodeId = encodeNodeID(validator.nodeID as Hex);
    const networkID = client.network === 'fuji' ? 5 : 1;
    const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID as Hex));
    logger.log('\nGetting validation uptime message...');
    const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID);
    const signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;
    const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex);
    const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
    accessList = [uptimeAccessList[0]];
  }

  return kiteStakingManager.safeWrite.initiateDelegatorRemoval(
    [delegationID, includeUptimeProof, 0],
    accessList ? { chain: null, accessList } : undefined,
  );
}

export async function ksmCompleteDelegatorRemoval(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'completeDelegatorRemoval'>,
  pchainClient: ExtendedWalletClient,
  initiateRemovalTxHash: Hex,
  delegationIDs?: Hex[],
  waitValidatorVisible = true,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/4: Parsing delegator removal receipt...');
  const parsed = await (async () => {
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await getValidatorManager(client, settings.manager);
    const allRemovals = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedDelegatorRemoval' });
    if (allRemovals.length === 0) throw new Error('No InitiatedDelegatorRemoval event found in the transaction logs, verify the transaction hash.');
    const toProcess = delegationIDs ? allRemovals.filter(e => delegationIDs.includes(e.args.delegationID)) : allRemovals;
    if (toProcess.length === 0) throw new Error('No matching InitiatedDelegatorRemoval event found for the provided delegationIDs.');
    return { receipt, toProcess, validatorManager };
  })().catch(error => {
    throw new Error(`[ksmCompleteDelegatorRemoval] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  });
  const { receipt, toProcess, validatorManager } = parsed;
  const allWarpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  progress(`Step 1/4: Done. Found ${toProcess.length} delegator removal(s) to process.`);

  let lastHash: Hex | undefined;
  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    const { delegationID, validationID } = event.args;
    const prefix = `[delegator ${i + 1}/${toProcess.length} delegationID=${delegationID}]`;

    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);

    const weightUpdates = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorWeightUpdate' })
      .filter(e => e.args.validationID === validationID);
    if (weightUpdates.length === 0) { logger.error(`${prefix} No InitiatedValidatorWeightUpdate event found`); continue; }

    const warpLog = allWarpLogs.find(w => w.args.messageID === weightUpdates[0].args.weightUpdateMessageID);
    if (!warpLog) { logger.error(`${prefix} No matching warp log found`); continue; }

    const { weight, nonce } = weightUpdates[0].args;
    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    progress(`${prefix} Step 2/4: Collecting C-Chain weight signatures...`);
    let signedL1ValidatorWeightMessage: string;
    try {
      signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
    } catch (error) {
      throw new Error(`[ksmCompleteDelegatorRemoval] ${prefix} Step 2 failed — collectCChainSignatures: ${error instanceof Error ? error.message : String(error)}`);
    }

    progress(`${prefix} Step 3/4: Setting validator weight on P-Chain...`);
    let weightSkipped = false;
    try {
      pipe(
        await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
        R.tap(txId => { progress(`${prefix} Step 3/4: Done. P-Chain txID=${txId}`); }),
        R.tapError(err => {
          if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
          weightSkipped = true;
        }),
      );
    } catch (error) {
      throw new Error(`[ksmCompleteDelegatorRemoval] ${prefix} Step 3 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (weightSkipped) progress(`${prefix} Step 3/4: Skipped — weight already set (stale nonce).`);

    progress(`${prefix} Step 4/4: Collecting P-Chain signatures and completing removal...`);
    let hash: Hex;
    try {
      const networkID = client.network === 'fuji' ? 5 : 1;
      const validationIDBytes = hexToBytes(validationID as Hex);
      const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), networkID, pChainChainID);
      const signedPChainMessage = await collectSignatures({ network: client.network, message: bytesToHex(unsignedPChainWarpMsg), signingSubnetId });
      const accessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainMessage}`));
      hash = await kiteStakingManager.safeWrite.completeDelegatorRemoval([delegationID, 0], { chain: null, accessList });
      if (waitValidatorVisible) {
        const subnetIDHex = await validatorManager.read.subnetID();
        progress(`${prefix} Step 4/4: Waiting for validator removal to be visible on P-Chain...`);
        await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some(v => v.nodeID === nodeID), 5000, 180000, res => res === false);
      }
    } catch (error) {
      throw new Error(`[ksmCompleteDelegatorRemoval] ${prefix} Step 4 failed — completeRemoval: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`${prefix} Step 4/4: Done. tx hash=${hash}`);
    lastHash = hash;
  }

  if (!lastHash) throw new Error('No delegator removals processed');
}

export async function ksmInitiateValidatorRemoval(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'initiateValidatorRemoval'>,
  nodeId: NodeId,
  includeUptimeProof = false,
): Promise<Hex> {
  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);
  const nodeIdBytes = parseNodeID(nodeId, false);
  const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
  return kiteStakingManager.safeWrite.initiateValidatorRemoval([validationID, includeUptimeProof, 0]);
}

export async function ksmCompleteValidatorRemoval(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'completeValidatorRemoval'>,
  pchainClient: ExtendedWalletClient,
  initiateRemovalTxHash: Hex,
  nodeIDs?: NodeId[],
  waitValidatorVisible = true,
  initiateTxHashes?: Hex[],
  onProgress?: (msg: string) => void,
): Promise<void> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/4: Parsing validator removal receipt...');
  const parsed = await (async () => {
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await getValidatorManager(client, settings.manager);
    const allRemovals = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRemoval' });
    if (allRemovals.length === 0) throw new Error('No InitiatedValidatorRemoval event found in the transaction logs, verify the transaction hash.');
    const toProcess = nodeIDs
      ? (await Promise.all(allRemovals.map(async e => {
        const v = await validatorManager.read.getValidator([e.args.validationID]);
        return { event: e, nodeId: encodeNodeID(v.nodeID as Hex) };
      }))).filter(({ nodeId }) => nodeIDs.includes(nodeId)).map(({ event }) => event)
      : allRemovals;
    if (toProcess.length === 0) throw new Error('No matching InitiatedValidatorRemoval event found for the provided NodeIDs.');
    const subnetIDHex = await validatorManager.read.subnetID();
    const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const currentValidators = await getCurrentValidators(client, subnetID);
    return { receipt, toProcess, validatorManager, subnetID, currentValidators };
  })().catch(error => {
    throw new Error(`[ksmCompleteValidatorRemoval] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  });
  const { receipt, toProcess, validatorManager, subnetID, currentValidators } = parsed;
  const allWarpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  progress(`Step 1/4: Done. Found ${toProcess.length} validator removal(s) to process.`);

  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    const { validationID } = event.args;
    const prefix = `[validator ${i + 1}/${toProcess.length} validationID=${validationID}]`;

    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);

    const warpLog = allWarpLogs.find(w => w.args.messageID === event.args.validatorWeightMessageID);
    if (!warpLog) { logger.error(`${prefix} No matching warp log found`); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    let addNodeBlockNumber = receipt.blockNumber;
    if (initiateTxHashes && initiateTxHashes.length > i) {
      const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHashes[i], confirmations: 0 });
      if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHashes[i]} reverted, pls use another initiate tx`);
      addNodeBlockNumber = addNodeReceipt.blockNumber;
    }

    const isValidator = currentValidators.some(v => v.nodeID === nodeID);
    if (!isValidator) {
      progress(`${prefix} Step 2/4: Skipped — validator not on P-Chain.`);
    } else {
      progress(`${prefix} Step 2/4: Collecting C-Chain weight signatures and setting P-Chain weight...`);
      try {
        const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
        pipe(
          await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
          R.tapError(error => { throw new Error('SetL1ValidatorWeightTx failed on P-Chain: ' + error); }),
          R.tap(txId => { progress(`${prefix} Step 2/4: Done. P-Chain txID=${txId}`); }),
        );
      } catch (error) {
        throw new Error(`[ksmCompleteValidatorRemoval] ${prefix} Step 2 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    progress(`${prefix} Step 3/4: Getting registration justification...`);
    let justification: Uint8Array | null;
    try {
      justification = await GetRegistrationJustification(nodeID, validationID, subnetID, client, addNodeBlockNumber);
      if (!justification) throw new Error('Justification not found for validator removal');
    } catch (error) {
      throw new Error(`[ksmCompleteValidatorRemoval] ${prefix} Step 3 failed — getJustification: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`${prefix} Step 3/4: Done.`);

    progress(`${prefix} Step 4/4: Aggregating P-Chain signatures and completing removal...`);
    let completeHash: Hex;
    try {
      const networkID = client.network === 'fuji' ? 5 : 1;
      const validationIDBytes = hexToBytes(validationID as Hex);
      const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, networkID, pChainChainID);
      const signedPChainMessage = await collectSignatures({ network: client.network, message: bytesToHex(unsignedPChainWarpMsg), justification: bytesToHex(justification), signingSubnetId });
      const accessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainMessage}`));
      completeHash = await kiteStakingManager.safeWrite.completeValidatorRemoval([0], { chain: null, accessList });
      if (waitValidatorVisible) {
        progress(`${prefix} Step 4/4: Waiting for validator to be removed from P-Chain...`);
        await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeID), 5000, 180000, res => res === false);
      }
    } catch (error) {
      throw new Error(`[ksmCompleteValidatorRemoval] ${prefix} Step 4 failed — completeRemoval: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`${prefix} Step 4/4: Done. tx hash=${completeHash}`);
  }
}

export async function ksmSubmitUptimeProof(
  client: ExtendedWalletClient,
  kiteStakingManager: IContract<TKiteStakingManagerABI, 'getStakingManagerSettings' | 'submitUptimeProof'>,
  nodeId: NodeId,
  rpcUrl: string,
): Promise<Hex> {
  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const networkID = client.network === 'fuji' ? 5 : 1;
  const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID as Hex));
  logger.log('\nGetting validation uptime message...');
  const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID);
  const signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;
  const uptimeAccessList = packWarpIntoAccessList(hexToBytes(signedUptimeMessageHex));
  const validators = await getCurrentValidatorsFromNode(rpcUrl);
  const validator = validators.find(v => v.nodeID === nodeId);
  if (!validator) throw new Error(`Validator with nodeID ${nodeId} not found in the current validator set`);
  return kiteStakingManager.safeWrite.submitUptimeProof([cb58ToHex(validator.validationID), 0], { accessList: uptimeAccessList });
}
