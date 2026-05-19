import { hexToBytes, bytesToHex, fromBytes, parseEventLogs, type Hex, type Address } from 'viem';
import { pipe, R } from '@mobily/ts-belt';
import { utils } from '@avalabs/avalanchejs';
import type { IContract, IReadContract } from '../client/contract';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { TStakingVaultABI } from './abi';
import StakingVaultABI from './abi';
import type { TValidatorManagerABI } from '../ValidatorManager/abi';
import ValidatorManagerABI from '../ValidatorManager/abi';
import { IWarpMessengerABI } from '../IWarpMessenger';
import { getKiteStakingManager } from '../KiteStaking';
import { getValidatorManager } from '../ValidatorManager';
import { bytes32ToAddress, encodeNodeID, parseNodeID, retryWhileError, type NodeId } from '../lib/avalancheUtils';
import { packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList, collectSignatures } from '../lib/warpUtils';
import { getSigningSubnetIdFromWarpMessage, getCurrentValidators, registerL1Validator, setValidatorWeight } from '../lib/pChainUtils';
import { GetRegistrationJustification } from '../lib/justification';
import { pChainChainID } from '../lib/avalancheUtils';
import { getValidationUptimeMessage } from '../UptimeTracker/service';
import { logger } from '../logger';

export type ValidatorManagerInfo = {
  validatorManagerAddress: Address;
  stakingManagerAddress: Address;
  stakingManagerStorageLocation: Hex;
};

export async function getValidatorManagerInfo(
  client: ExtendedClient,
  stakingVault: IReadContract<TStakingVaultABI, 'getStakingManager'>,
): Promise<ValidatorManagerInfo> {
  const stakingManagerAddress = await stakingVault.read.getStakingManager();
  const stakingManager = await getKiteStakingManager(client, stakingManagerAddress);
  const stakingManagerStorageLocation = await stakingManager.read.STAKING_MANAGER_STORAGE_LOCATION() as Hex;
  const validatorManagerAddress = bytes32ToAddress(
    (await client.getStorageAt({ address: stakingManagerAddress, slot: stakingManagerStorageLocation })) as Hex
  ) as Address;
  return { validatorManagerAddress, stakingManagerAddress, stakingManagerStorageLocation };
}

export async function svInitiateValidatorRemoval(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'initiateValidatorRemoval'>,
  nodeId: NodeId,
): Promise<{ hash: Hex; validationID: Hex }> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);
  const nodeIdBytes = parseNodeID(nodeId, false);
  const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
  const hash = await stakingVault.safeWrite.initiateValidatorRemoval([validationID]);
  await client.waitForTransactionReceipt({ hash });
  return { hash, validationID };
}

export async function svForceRemoveValidator(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'forceRemoveValidator'>,
  nodeId: NodeId,
): Promise<Hex> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);
  const nodeIdBytes = parseNodeID(nodeId, false);
  const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
  const hash = await stakingVault.safeWrite.forceRemoveValidator([validationID]);
  await client.waitForTransactionReceipt({ hash });
  return hash;
}

export async function svInitiateDelegatorRegistration(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'initiateDelegatorRegistration'>,
  nodeId: NodeId,
  amountWei: bigint,
): Promise<{ hash: Hex; validationID: Hex }> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);
  const nodeIdBytes = parseNodeID(nodeId, false);
  const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
  const hash = await stakingVault.safeWrite.initiateDelegatorRegistration([validationID, amountWei]);
  await client.waitForTransactionReceipt({ hash });
  return { hash, validationID };
}

export type PChainOwnerOptions = {
  threshold?: number;
  addresses?: Hex[];
};

export async function svInitiateValidatorRegistration(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'initiateValidatorRegistration'>,
  nodeId: NodeId,
  blsKey: Hex,
  stakeAmountWei: bigint,
  remainingBalanceOwner?: PChainOwnerOptions,
  disableOwner?: PChainOwnerOptions,
): Promise<Hex> {
  const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex') as Hex;
  const remainingBalanceAddresses = remainingBalanceOwner?.addresses?.length ? remainingBalanceOwner.addresses : [defaultOwnerAddress];
  const disableAddresses = disableOwner?.addresses?.length ? disableOwner.addresses : [defaultOwnerAddress];
  const nodeIdBytes = parseNodeID(nodeId, false);
  return stakingVault.safeWrite.initiateValidatorRegistration([
    nodeIdBytes,
    blsKey,
    { threshold: remainingBalanceOwner?.threshold ?? 1, addresses: remainingBalanceAddresses },
    { threshold: disableOwner?.threshold ?? 1, addresses: disableAddresses },
    stakeAmountWei,
  ]);
}

export async function svCompleteValidatorRegistration(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeValidatorRegistration'>,
  pchainClient: ExtendedWalletClient,
  initiateTxHash: Hex,
  blsProofOfPossession: Hex,
  initialBalance: bigint,
  waitValidatorVisible = true,
): Promise<Hex> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);

  logger.log('Completing validator registration in StakingVault...');
  const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });

  const validatorRegisteredEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: 'StakingVault__ValidatorRegistrationInitiated',
  });
  if (!validatorRegisteredEvents || validatorRegisteredEvents.length === 0) {
    throw new Error('No StakingVault__ValidatorRegistrationInitiated event found in transaction logs, verify the transaction hash.');
  }
  const validationIDHex = validatorRegisteredEvents[0].args?.validationID;
  if (!validationIDHex) throw new Error('No validationID found in StakingVault__ValidatorRegistrationInitiated event.');

  const validator = await validatorManager.read.getValidator([validationIDHex]);
  const nodeId = encodeNodeID(validator.nodeID as Hex);
  const subnetIDHex = await validatorManager.read.subnetID();
  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  if (!warpLogs || warpLogs.length === 0) throw new Error('No IWarpMessenger event found in the transaction logs.');

  const warpLog = warpLogs[0];
  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);
  const subnetIDStr = utils.base58check.encode(hexToBytes(subnetIDHex));
  const isValidator = (await getCurrentValidators(client, subnetIDStr)).some(v => v.nodeID === nodeId);

  if (isValidator) {
    logger.log('Node is already registered as a validator on the P-Chain, skipping registerL1Validator call.');
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

  logger.log('\nCalling function completeValidatorRegistration on the staking vault...');
  const hash = await stakingVault.safeWrite.completeValidatorRegistration([0], { chain: null, accessList });

  if (waitValidatorVisible) {
    logger.log('Waiting for the validator to be visible on the P-Chain (may take a while)...');
    await retryWhileError(
      async () => (await getCurrentValidators(client, subnetIDStr)).some(v => v.nodeID === nodeId),
      5000, 180000, (res) => res === true,
    );
  }
  return hash;
}

export async function svCompleteDelegatorRegistration(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeDelegatorRegistration'>,
  pchainClient: ExtendedWalletClient,
  initiateTxHash: Hex,
  rpcUrl: string,
  bypassToken?: string,
): Promise<Hex> {
  const { validatorManagerAddress, stakingManagerAddress, stakingManagerStorageLocation } = await getValidatorManagerInfo(client, stakingVault);

  const uptimeBlockchainIDRaw = await client.getStorageAt({
    address: stakingManagerAddress,
    slot: `0x${(BigInt(stakingManagerStorageLocation) + 6n).toString(16).padStart(64, '0')}`,
  });
  if (!uptimeBlockchainIDRaw || uptimeBlockchainIDRaw === '0x0') throw new Error('Could not get uptime blockchain ID');
  const uptimeBlockchainID = uptimeBlockchainIDRaw as Hex;

  const validatorManager = await getValidatorManager(client, validatorManagerAddress);

  logger.log('Completing delegator registration in StakingVault...');
  const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

  const delegatorRegisteredEvents = parseEventLogs({
    abi: StakingVaultABI,
    logs: receipt.logs,
    eventName: 'StakingVault__DelegatorRegistrationInitiated',
  });
  if (!delegatorRegisteredEvents || delegatorRegisteredEvents.length === 0) {
    throw new Error('No StakingVault__DelegatorRegistrationInitiated event found in transaction logs, verify the transaction hash.');
  }
  const delegationID = delegatorRegisteredEvents[0].args?.delegationID;
  const validationID = delegatorRegisteredEvents[0].args?.validationID;
  if (!delegationID || !validationID) throw new Error('No delegationID or validationID found in StakingVault__DelegatorRegistrationInitiated event.');

  const validator = await validatorManager.read.getValidator([validationID]);
  const nodeId = encodeNodeID(validator.nodeID as Hex);

  const weightUpdateEvents = parseEventLogs({
    abi: ValidatorManagerABI,
    logs: receipt.logs,
    eventName: 'InitiatedValidatorWeightUpdate',
  });
  const weightUpdateEvent = weightUpdateEvents.find(e => e.args?.validationID === validationID);
  if (!weightUpdateEvent) throw new Error('No InitiatedValidatorWeightUpdate event found for validationID, verify the transaction hash.');

  const { weight: validatorWeight, nonce, weightUpdateMessageID: setWeightMessageID } = weightUpdateEvent.args;
  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  const weightWarpLog = warpLogs.find(w => w.args.messageID === setWeightMessageID);
  if (!weightWarpLog) throw new Error('No matching warp message found for setWeightMessageID, verify the transaction hash.');

  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, weightWarpLog.args.message);
  logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
  const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: weightWarpLog.args.message, signingSubnetId });
  logger.log('Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain');

  logger.log('\nSetting validator weight on P-Chain...');
  pipe(
    await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
    R.tap(pChainSetWeightTxId => logger.log('SetL1ValidatorWeightTx executed on P-Chain:', pChainSetWeightTxId)),
    R.tapError(err => {
      if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
      logger.warn(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`);
    }),
  );

  const validationIDBytes = hexToBytes(validationID as Hex);
  const networkID = client.network === 'fuji' ? 5 : 1;
  const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(validatorWeight), networkID, pChainChainID);
  const unsignedPChainWeightWarpMsgHex = bytesToHex(unsignedPChainWeightWarpMsg);
  const sourceChainID = utils.base58check.encode(hexToBytes(uptimeBlockchainID));

  logger.log('\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...');
  const signedPChainWeightMessage = await collectSignatures({ network: client.network, message: unsignedPChainWeightWarpMsgHex, signingSubnetId });

  logger.log('\nGetting validation uptime message...');
  const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID, bypassToken);
  const signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;

  const signedPChainWeightWarpMsgBytes = hexToBytes(`0x${signedPChainWeightMessage}`);
  const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex);
  const weightAccessList = packWarpIntoAccessList(signedPChainWeightWarpMsgBytes);
  const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
  const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]];

  logger.log('\nCalling function completeDelegatorRegistration...');
  const hash = await stakingVault.safeWrite.completeDelegatorRegistration([delegationID, 0, 1], { chain: null, accessList: combinedAccessList });
  return hash;
}

export async function svCompleteValidatorRemoval(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeValidatorRemoval'>,
  pchainClient: ExtendedWalletClient,
  initiateRemovalTxHash: Hex,
  nodeIDs?: NodeId[],
  waitValidatorVisible = true,
  initiateTxHash?: Hex,
): Promise<void> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);

  logger.log('Completing validator removal in StakingVault...');
  const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

  const validatorRemovalInitiatedEvents = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__ValidatorRemovalInitiated' });
  if (validatorRemovalInitiatedEvents.length === 0) throw new Error('No StakingVault__ValidatorRemovalInitiated event found in the transaction logs, verify the transaction hash.');

  const filteredRemovals = nodeIDs
    ? (await Promise.all(
      validatorRemovalInitiatedEvents.map(async e => {
        const validationID = e.args?.validationID;
        if (!validationID) return null;
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeId = encodeNodeID(validator.nodeID as Hex);
        return { event: e, nodeId };
      }),
    )).filter((item): item is { event: typeof validatorRemovalInitiatedEvents[0]; nodeId: NodeId } => item !== null && nodeIDs.includes(item.nodeId)).map(({ event }) => event)
    : validatorRemovalInitiatedEvents;
  if (filteredRemovals.length === 0) throw new Error('No matching StakingVault__ValidatorRemovalInitiated event found for the provided NodeIDs, verify the transaction hash and NodeIDs.');

  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  const subnetIDHex = await validatorManager.read.subnetID();
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  const currentValidators = await getCurrentValidators(client, subnetID);
  const validatorManagerRemovalEvents = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRemoval' });

  let addNodeBlockNumber = receipt.blockNumber;
  if (initiateTxHash) {
    const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
    if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);
    addNodeBlockNumber = addNodeReceipt.blockNumber;
  }

  for (const event of filteredRemovals) {
    const validationID = event.args?.validationID;
    if (!validationID) { logger.error('No validationID found in StakingVault__ValidatorRemovalInitiated event.'); continue; }

    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);
    logger.log(`Processing removal for node ${nodeID}`);

    const validatorManagerEvent = validatorManagerRemovalEvents.find(e => e.args?.validationID === validationID);
    if (!validatorManagerEvent) { logger.error(`No matching ValidatorManager InitiatedValidatorRemoval event found for validationID ${validationID}`); continue; }

    const warpLog = warpLogs.find(w => w.args.messageID === validatorManagerEvent.args.validatorWeightMessageID);
    if (!warpLog) { logger.error(`No matching warp log found for validationID ${validationID}`); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    const isValidator = currentValidators.some(v => v.nodeID === nodeID);
    if (!isValidator) {
      logger.log('Node is not registered as a validator on the P-Chain.');
    } else {
      logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
      const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
      logger.log('\nSetting validator weight on P-Chain...');
      pipe(
        await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
        R.tapError(error => { throw new Error('SetL1ValidatorWeightTx failed on P-Chain: ' + error + '\n'); }),
        R.tap(txId => { logger.log('SetL1ValidatorWeightTx executed on P-Chain: ' + txId); }),
      );
    }

    const justification = await GetRegistrationJustification(nodeID, validationID, pChainChainID, client, addNodeBlockNumber);
    if (!justification) throw new Error('Justification not found for validator removal');

    const networkID = client.network === 'fuji' ? 5 : 1;
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, networkID, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);
    logger.log('\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...');
    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification as Uint8Array), signingSubnetId });

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
    logger.log('Executing completeValidatorRemoval transaction...');
    const completeHash = await stakingVault.safeWrite.completeValidatorRemoval([0], { chain: null, accessList });

    if (waitValidatorVisible) {
      logger.log('Waiting for the validator to be removed from the P-Chain (may take a while)...');
      await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
    }
    logger.log('completeValidatorRemoval executed successfully, tx hash:', completeHash);
  }
}

export async function svCompleteDelegatorRemoval(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeDelegatorRemoval' | 'getDelegatorInfo'>,
  pchainClient: ExtendedWalletClient,
  initiateRemovalTxHash: Hex,
  delegationIDs?: Hex[],
): Promise<void> {
  const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
  const validatorManager = await getValidatorManager(client, validatorManagerAddress);

  logger.log('Completing delegator removal in StakingVault...');
  const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

  const delegatorRemovalInitiatedEvents = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__DelegatorRemovalInitiated' });
  if (delegatorRemovalInitiatedEvents.length === 0) throw new Error('No StakingVault__DelegatorRemovalInitiated event found in the transaction logs, verify the transaction hash.');

  const filteredRemovals = delegationIDs
    ? delegatorRemovalInitiatedEvents.filter(e => { const id = e.args?.delegationID; return id && delegationIDs.includes(id); })
    : delegatorRemovalInitiatedEvents;
  if (filteredRemovals.length === 0) throw new Error('No matching StakingVault__DelegatorRemovalInitiated event found for the provided delegationIDs, verify the transaction hash and delegationIDs.');

  const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  let lastHash: Hex | undefined;

  for (const event of filteredRemovals) {
    const delegationID = event.args?.delegationID;
    if (!delegationID) { logger.error('No delegationID found in StakingVault__DelegatorRemovalInitiated event.'); continue; }

    const delegatorInfo = await stakingVault.read.getDelegatorInfo([delegationID]);
    const validationID = delegatorInfo.validationID;
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);
    logger.log(`Processing removal for delegation ${delegationID}, node ${nodeID}`);

    const initiatedWeightUpdates = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorWeightUpdate' })
      .filter(e => e.args.validationID === validationID);
    if (initiatedWeightUpdates.length === 0) { logger.error(`No InitiatedValidatorWeightUpdate event found for validationID ${validationID}`); continue; }

    const weightUpdateEvent = initiatedWeightUpdates[0];
    const warpLog = warpLogs.find(w => w.args.messageID === weightUpdateEvent.args.weightUpdateMessageID);
    if (!warpLog) { logger.error(`No matching warp log found for weightUpdateMessageID ${weightUpdateEvent.args.weightUpdateMessageID}`); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);
    const { weight, nonce } = weightUpdateEvent.args;
    logger.log('\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...');
    const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });

    logger.log('\nSetting validator weight on P-Chain...');
    pipe(
      await setValidatorWeight({ client: pchainClient, validationID, message: signedL1ValidatorWeightMessage }),
      R.tap(txId => logger.log('SetL1ValidatorWeightTx executed on P-Chain:', txId)),
      R.tapError(err => {
        if (!String(err).includes('warp message contains stale nonce')) throw new Error(String(err));
        logger.warn(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`);
      }),
    );

    const networkID = client.network === 'fuji' ? 5 : 1;
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), networkID, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);
    logger.log('\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...');
    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: unsignedPChainWarpMsgHex, signingSubnetId });

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
    logger.log('\nCalling function completeDelegatorRemoval...');
    const hash = await stakingVault.safeWrite.completeDelegatorRemoval([delegationID, 0], { chain: null, accessList });
    logger.log('completeDelegatorRemoval executed successfully, tx hash:', hash);
    lastHash = hash;
  }

  if (!lastHash) throw new Error('No delegator removals processed');
}
