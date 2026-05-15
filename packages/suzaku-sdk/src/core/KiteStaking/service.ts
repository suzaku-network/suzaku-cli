import { bytesToHex, hexToBytes, fromBytes, parseEventLogs, type Hex, type Address } from 'viem';
import { color } from 'console-log-colors';
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
): Promise<Hex> {
  const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });

  const initiatedStakingRegistration = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedStakingValidatorRegistration' })[0];
  if (!initiatedStakingRegistration) throw new Error('No InitiatedStakingValidatorRegistration event found in the transaction logs, verify the transaction hash.');

  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);

  const initiatedValidatorRegistration = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRegistration' })[0];
  if (!initiatedValidatorRegistration) throw new Error('No InitiatedValidatorRegistration event found in the transaction logs, verify the transaction hash.');

  const warpLog = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs })[0];
  if (!warpLog) throw new Error('No IWarpMessenger event found in the transaction logs.');

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);
  const validationIDHex = initiatedValidatorRegistration.args.validationID;
  const nodeId = encodeNodeID(initiatedValidatorRegistration.args.nodeID as Hex);
  const subnetIDHex = await validatorManager.read.subnetID();
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  const isValidator = (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId);

  if (isValidator) {
    logger.log(color.yellow('Node is already registered as a validator on the P-Chain, skipping registerL1Validator call.'));
  } else {
    logger.log('\nCollecting signatures for the L1ValidatorRegistrationMessage from the Validator Manager chain...');
    const signedMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
    logger.log('\nRegistering validator on P-Chain...');
    pipe(
      await registerL1Validator({ client: pchainClient, blsProofOfPossession, signedMessage, initialBalance }),
      R.tap(pChainTxId => logger.log('RegisterL1ValidatorTx executed on P-Chain:', pChainTxId)),
      R.tapError(err => { throw new Error(String(err)); }),
    );
  }

  const validationIDBytes = hexToBytes(validationIDHex as Hex);
  const networkID = client.network === 'fuji' ? 5 : 1;
  const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, networkID, pChainChainID);
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

  logger.log('\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...');
  const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });

  const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
  const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

  logger.log('\nCalling function completeValidatorRegistration...');
  const hash = await kiteStakingManager.safeWrite.completeValidatorRegistration([0], { chain: null, accessList });

  if (waitValidatorVisible) {
    logger.log('Waiting for the validator to be visible on the P-Chain (may take a while)...');
    await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId), 5000, 180000, res => res === true);
  }
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
): Promise<Hex> {
  const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);

  const initiatedDelegatorRegistration = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedDelegatorRegistration' })[0];
  if (!initiatedDelegatorRegistration) throw new Error('No InitiatedDelegatorRegistration event found in the transaction logs, verify the transaction hash.');

  const { delegationID, validationID, validatorWeight, nonce, setWeightMessageID } = initiatedDelegatorRegistration.args;

  const validator = await validatorManager.read.getValidator([validationID]);
  const nodeId = encodeNodeID(validator.nodeID as Hex);

  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs[0].args.message);

  const weightWarpLog = warpLogs.find(w => w.args.messageID === setWeightMessageID);
  if (!weightWarpLog) throw new Error('No matching warp message found for setWeightMessageID, verify the transaction hash.');

  logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
  const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: weightWarpLog.args.message, signingSubnetId });
  logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain');

  logger.log('\nSetting validator weight on P-Chain...');
  pipe(
    await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
    R.tap(pChainSetWeightTxId => logger.log('SetL1ValidatorWeightTx executed on P-Chain:', pChainSetWeightTxId)),
    R.tapError(err => {
      if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
      logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`));
    }),
  );

  const validationIDBytes = hexToBytes(validationID as Hex);
  const networkID = client.network === 'fuji' ? 5 : 1;
  const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(validatorWeight), networkID, pChainChainID);
  const unsignedPChainWeightWarpMsgHex = bytesToHex(unsignedPChainWeightWarpMsg);
  const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID as Hex));

  logger.log('\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...');
  const signedPChainWeightMessage = await collectSignatures({ network: client.network, message: unsignedPChainWeightWarpMsgHex, signingSubnetId });
  logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain');

  logger.log('\nGetting validation uptime message...');
  const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID);
  const signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;

  const signedPChainWeightWarpMsgBytes = hexToBytes(`0x${signedPChainWeightMessage}`);
  const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex);
  const weightAccessList = packWarpIntoAccessList(signedPChainWeightWarpMsgBytes);
  const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
  const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]];

  logger.log('\nCalling function completeDelegatorRegistration...');
  return kiteStakingManager.safeWrite.completeDelegatorRegistration([delegationID, 0, 1], { chain: null, accessList: combinedAccessList });
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
): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);

  const initiatedDelegatorRemovals = parseEventLogs({ abi: KiteStakingManagerABI, logs: receipt.logs, eventName: 'InitiatedDelegatorRemoval' });
  if (initiatedDelegatorRemovals.length === 0) throw new Error('No InitiatedDelegatorRemoval event found in the transaction logs, verify the transaction hash.');

  const filteredRemovals = delegationIDs
    ? initiatedDelegatorRemovals.filter(e => delegationIDs.includes(e.args.delegationID))
    : initiatedDelegatorRemovals;
  if (filteredRemovals.length === 0) throw new Error('No matching InitiatedDelegatorRemoval event found for the provided delegationIDs, verify the transaction hash and delegationIDs.');

  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  let lastHash: Hex | undefined;

  for (const event of filteredRemovals) {
    const { delegationID, validationID } = event.args;
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);
    logger.log(`Processing removal for delegation ${delegationID}, node ${nodeID}`);

    const weightUpdates = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorWeightUpdate' })
      .filter(e => e.args.validationID === validationID);
    if (weightUpdates.length === 0) { logger.error(color.red(`No InitiatedValidatorWeightUpdate event found for validationID ${validationID}`)); continue; }

    const weightUpdateEvent = weightUpdates[0];
    const warpLog = warpLogs.find(w => w.args.messageID === weightUpdateEvent.args.weightUpdateMessageID);
    if (!warpLog) { logger.error(color.red(`No matching warp log found for weightUpdateMessageID ${weightUpdateEvent.args.weightUpdateMessageID}`)); continue; }

    const { weight, nonce } = weightUpdateEvent.args;
    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
    const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
    logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain');

    logger.log('\nSetting validator weight on P-Chain...');
    pipe(
      await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
      R.tap(pChainSetWeightTxId => logger.log('SetL1ValidatorWeightTx executed on P-Chain:', pChainSetWeightTxId)),
      R.tapError(err => {
        if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
        logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`));
      }),
    );

    const validationIDBytes = hexToBytes(validationID as Hex);
    const networkID = client.network === 'fuji' ? 5 : 1;
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), networkID, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    logger.log('\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...');
    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });
    logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain');

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    logger.log('\nCalling function completeDelegatorRemoval...');
    const hash = await kiteStakingManager.safeWrite.completeDelegatorRemoval([delegationID, 0], { chain: null, accessList });

    if (waitValidatorVisible) {
      const subnetIDHex = await validatorManager.read.subnetID();
      logger.log('Waiting for the validator to be removed from the P-Chain (may take a while)...');
      await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some(v => v.nodeID === nodeID), 5000, 180000, res => res === false);
    }

    logger.log('completeDelegatorRemoval executed successfully, tx hash:', hash);
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
): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

  const settings = await kiteStakingManager.read.getStakingManagerSettings();
  const validatorManager = await getValidatorManager(client, settings.manager);

  const initiatedValidatorRemovals = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRemoval' });
  if (initiatedValidatorRemovals.length === 0) throw new Error('No InitiatedValidatorRemoval event found in the transaction logs, verify the transaction hash.');

  const filteredRemovals = nodeIDs
    ? (await Promise.all(
        initiatedValidatorRemovals.map(async e => {
          const validator = await validatorManager.read.getValidator([e.args.validationID]);
          return { event: e, nodeId: encodeNodeID(validator.nodeID as Hex) };
        }),
      )).filter(({ nodeId }) => nodeIDs.includes(nodeId)).map(({ event }) => event)
    : initiatedValidatorRemovals;

  if (filteredRemovals.length === 0) throw new Error('No matching InitiatedValidatorRemoval event found for the provided NodeIDs, verify the transaction hash and NodeIDs.');

  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  const subnetIDHex = await validatorManager.read.subnetID();
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  const currentValidators = await getCurrentValidators(client, subnetID);

  for (const event of filteredRemovals) {
    const eventIndex = filteredRemovals.indexOf(event);
    const { validationID } = event.args;
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);
    logger.log(`Processing removal for node ${nodeID}`);

    const warpLog = warpLogs.find(w => w.args.messageID === event.args.validatorWeightMessageID);
    if (!warpLog) { logger.error(color.red(`No matching warp log found for validationID ${validationID}`)); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    let addNodeBlockNumber = receipt.blockNumber;
    if (initiateTxHashes && initiateTxHashes.length > eventIndex) {
      const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHashes[eventIndex], confirmations: 0 });
      if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHashes[eventIndex]} reverted, pls use another initiate tx`);
      addNodeBlockNumber = addNodeReceipt.blockNumber;
    }

    const isValidator = currentValidators.some(v => v.nodeID === nodeID);
    if (!isValidator) {
      logger.log(color.yellow('Node is not registered as a validator on the P-Chain.'));
    } else {
      logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
      const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
      logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain');
      pipe(
        await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
        R.tapError(error => { throw new Error('SetL1ValidatorWeightTx failed on P-Chain: ' + error + '\n'); }),
        R.tap(txId => { logger.log('SetL1ValidatorWeightTx executed on P-Chain: ' + txId); }),
      );
    }

    const justification = await GetRegistrationJustification(nodeID, validationID, subnetID, client, addNodeBlockNumber);
    if (!justification) throw new Error('Justification not found for validator removal');

    const networkID = client.network === 'fuji' ? 5 : 1;
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, networkID, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);
    logger.log('\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...');
    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification as Uint8Array), signingSubnetId });
    logger.log('Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain');

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    logger.log('Executing completeValidatorRemoval transaction...');
    const completeHash = await kiteStakingManager.safeWrite.completeValidatorRemoval([0], { chain: null, accessList });

    if (waitValidatorVisible) {
      logger.log('Waiting for the validator to be removed from the P-Chain (may take a while)...');
      await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeID), 5000, 180000, res => res === false);
    }

    logger.log('completeValidatorRemoval executed successfully, tx hash:', completeHash);
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
