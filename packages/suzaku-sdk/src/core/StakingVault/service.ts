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
  if (validationID === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error(`Node ${nodeId} is not registered as a validator`);
  }
  const validator = await validatorManager.read.getValidator([validationID]);
  if (validator.status !== 2) {
    const statusNames = ['Unknown', 'PendingAdded', 'Active', 'PendingRemoved', 'Completed', 'Invalidated', 'PendingStakeUpdated'];
    throw new Error(`Validator ${nodeId} is not Active (current status: ${statusNames[validator.status] ?? validator.status})`);
  }
  console.log({ validationID, amountWei });
  console.log(client.chain?.rpcUrls.default.http)
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
    const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
    const validatorManager = await getValidatorManager(client, validatorManagerAddress);
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });
    const vaultEvents = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__ValidatorRegistrationInitiated' });
    if (vaultEvents.length === 0) throw new Error('No StakingVault__ValidatorRegistrationInitiated event found in transaction logs, verify the transaction hash.');
    validationIDHex = vaultEvents[0].args.validationID as Hex;
    const validator = await validatorManager.read.getValidator([validationIDHex]);
    nodeId = encodeNodeID(validator.nodeID as Hex);
    const subnetIDHex = await validatorManager.read.subnetID();
    subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
    if (warpLogs.length === 0) throw new Error('No IWarpMessenger event found in the transaction logs.');
    warpMessage = warpLogs[0].args.message as Hex;
    signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpMessage);
  } catch (error) {
    throw new Error(`[svCompleteValidatorRegistration] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 1/5: Done. validationID=${validationIDHex}, nodeId=${nodeId}`);

  progress('Step 2/5: Checking P-Chain registration status...');
  let isAlreadyRegistered: boolean;
  try {
    isAlreadyRegistered = (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId);
  } catch (error) {
    throw new Error(`[svCompleteValidatorRegistration] Step 2 failed — checkPChainRegistration: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`[svCompleteValidatorRegistration] Step 3 failed — registerOnPChain: ${error instanceof Error ? error.message : String(error)}`);
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
    throw new Error(`[svCompleteValidatorRegistration] Step 4 failed — collectPChainSignatures: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress('Step 4/5: Done.');

  progress('Step 5/5: Submitting completeValidatorRegistration on C-Chain...');
  let hash: Hex;
  try {
    const accessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainMessage}`));
    hash = await stakingVault.safeWrite.completeValidatorRegistration([0], { chain: null, accessList });
    if (waitValidatorVisible) {
      progress('Step 5/5: Waiting for validator to be visible on P-Chain...');
      await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeId), 5000, 180000, res => res === true);
    }
  } catch (error) {
    throw new Error(`[svCompleteValidatorRegistration] Step 5 failed — submitComplete: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 5/5: Done. tx hash=${hash}`);

  return hash;
}

export async function svCompleteDelegatorRegistration(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeDelegatorRegistration'>,
  pchainClient: ExtendedWalletClient,
  initiateTxHash: Hex,
  rpcUrl: string,
  bypassToken?: string,
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
    const { validatorManagerAddress, stakingManagerAddress, stakingManagerStorageLocation } = await getValidatorManagerInfo(client, stakingVault);
    const uptimeBlockchainIDRaw = await client.getStorageAt({
      address: stakingManagerAddress,
      slot: `0x${(BigInt(stakingManagerStorageLocation) + 6n).toString(16).padStart(64, '0')}`,
    });
    if (!uptimeBlockchainIDRaw || uptimeBlockchainIDRaw === '0x0') throw new Error('Could not get uptime blockchain ID');
    const validatorManager = await getValidatorManager(client, validatorManagerAddress);
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);
    const delegatorEvents = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__DelegatorRegistrationInitiated' });
    if (delegatorEvents.length === 0) throw new Error('No StakingVault__DelegatorRegistrationInitiated event found in transaction logs.');
    delegationID = delegatorEvents[0].args.delegationID as Hex;
    validationID = delegatorEvents[0].args.validationID as Hex;
    const validator = await validatorManager.read.getValidator([validationID]);
    nodeId = encodeNodeID(validator.nodeID as Hex);
    const weightUpdateEvents = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorWeightUpdate' });
    const weightUpdateEvent = weightUpdateEvents.find(e => e.args.validationID === validationID);
    if (!weightUpdateEvent) throw new Error('No InitiatedValidatorWeightUpdate event found for validationID.');
    validatorWeight = BigInt(weightUpdateEvent.args.weight);
    nonce = BigInt(weightUpdateEvent.args.nonce);
    const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
    const weightWarpLog = warpLogs.find(w => w.args.messageID === weightUpdateEvent.args.weightUpdateMessageID);
    if (!weightWarpLog) throw new Error('No matching warp message found for weightUpdateMessageID.');
    weightWarpMessage = weightWarpLog.args.message as Hex;
    signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, weightWarpMessage);
    networkID = client.network === 'fuji' ? 5 : 1;
    sourceChainID = utils.base58check.encode(hexToBytes(uptimeBlockchainIDRaw as Hex));
  } catch (error) {
    throw new Error(`[svCompleteDelegatorRegistration] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
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
    throw new Error(`[svCompleteDelegatorRegistration] Step 2 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (weightSkipped) progress('Step 2/4: Skipped — weight already set (stale nonce).');

  progress('Step 3/4: Collecting P-Chain weight signatures and uptime message...');
  let signedPChainWeightMessage: string;
  let signedUptimeMessageHex: Hex;
  try {
    const validationIDBytes = hexToBytes(validationID);
    const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, nonce, validatorWeight, networkID, pChainChainID);
    signedPChainWeightMessage = await collectSignatures({ network: client.network, message: bytesToHex(unsignedPChainWeightWarpMsg), signingSubnetId });
    const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, networkID, sourceChainID, bypassToken);
    signedUptimeMessageHex = (signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`) as Hex;
  } catch (error) {
    throw new Error(`[svCompleteDelegatorRegistration] Step 3 failed — collectSignaturesAndUptime: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress('Step 3/4: Done.');

  progress('Step 4/4: Submitting completeDelegatorRegistration on C-Chain...');
  let hash: Hex;
  try {
    const weightAccessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainWeightMessage}`));
    const uptimeAccessList = packWarpIntoAccessList(hexToBytes(signedUptimeMessageHex));
    const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]];
    hash = await stakingVault.safeWrite.completeDelegatorRegistration([delegationID, 0, 1], { chain: null, accessList: combinedAccessList });
  } catch (error) {
    throw new Error(`[svCompleteDelegatorRegistration] Step 4 failed — submitComplete: ${error instanceof Error ? error.message : String(error)}`);
  }
  progress(`Step 4/4: Done. tx hash=${hash}`);

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
  onProgress?: (msg: string) => void,
): Promise<void> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/4: Parsing validator removal receipt...');
  const parsed = await (async () => {
    const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
    const validatorManager = await getValidatorManager(client, validatorManagerAddress);
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);
    const allVaultRemovals = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__ValidatorRemovalInitiated' });
    if (allVaultRemovals.length === 0) throw new Error('No StakingVault__ValidatorRemovalInitiated event found in the transaction logs.');
    const toProcess = nodeIDs
      ? (await Promise.all(allVaultRemovals.map(async e => {
        const validationID = e.args.validationID;
        if (!validationID) return null;
        const v = await validatorManager.read.getValidator([validationID]);
        return { event: e, nodeId: encodeNodeID(v.nodeID as Hex) };
      }))).filter((item): item is { event: typeof allVaultRemovals[0]; nodeId: NodeId } => item !== null && nodeIDs.includes(item.nodeId)).map(({ event }) => event)
      : allVaultRemovals;
    if (toProcess.length === 0) throw new Error('No matching StakingVault__ValidatorRemovalInitiated event found for the provided NodeIDs.');
    const subnetIDHex = await validatorManager.read.subnetID();
    const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const currentValidators = await getCurrentValidators(client, subnetID);
    let addNodeBlockNumber = receipt.blockNumber;
    if (initiateTxHash) {
      const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
      if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);
      addNodeBlockNumber = addNodeReceipt.blockNumber;
    }
    return { receipt, toProcess, validatorManager, subnetID, currentValidators, addNodeBlockNumber };
  })().catch(error => {
    throw new Error(`[svCompleteValidatorRemoval] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  });
  const { receipt, toProcess, validatorManager, subnetID, currentValidators, addNodeBlockNumber } = parsed;
  const allWarpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  const vmRemovalEvents = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorRemoval' });
  progress(`Step 1/4: Done. Found ${toProcess.length} validator removal(s) to process.`);

  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    const validationID = event.args.validationID;
    if (!validationID) { logger.error('No validationID in StakingVault__ValidatorRemovalInitiated event.'); continue; }
    const prefix = `[validator ${i + 1}/${toProcess.length} validationID=${validationID}]`;

    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);

    const vmEvent = vmRemovalEvents.find(e => e.args.validationID === validationID);
    if (!vmEvent) { logger.error(`${prefix} No matching ValidatorManager InitiatedValidatorRemoval event found`); continue; }

    const warpLog = allWarpLogs.find(w => w.args.messageID === vmEvent.args.validatorWeightMessageID);
    if (!warpLog) { logger.error(`${prefix} No matching warp log found`); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

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
        throw new Error(`[svCompleteValidatorRemoval] ${prefix} Step 2 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    progress(`${prefix} Step 3/4: Getting registration justification...`);
    let justification: Uint8Array | null;
    try {
      justification = await GetRegistrationJustification(nodeID, validationID, pChainChainID, client, addNodeBlockNumber);
      if (!justification) throw new Error('Justification not found for validator removal');
    } catch (error) {
      throw new Error(`[svCompleteValidatorRemoval] ${prefix} Step 3 failed — getJustification: ${error instanceof Error ? error.message : String(error)}`);
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
      completeHash = await stakingVault.safeWrite.completeValidatorRemoval([0], { chain: null, accessList });
      if (waitValidatorVisible) {
        progress(`${prefix} Step 4/4: Waiting for validator to be removed from P-Chain...`);
        await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some(v => v.nodeID === nodeID), 5000, 180000, res => res === false);
      }
    } catch (error) {
      throw new Error(`[svCompleteValidatorRemoval] ${prefix} Step 4 failed — completeRemoval: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`${prefix} Step 4/4: Done. tx hash=${completeHash}`);
  }
}

export async function svCompleteDelegatorRemoval(
  client: ExtendedWalletClient,
  stakingVault: IContract<TStakingVaultABI, 'getStakingManager' | 'completeDelegatorRemoval' | 'getDelegatorInfo'>,
  pchainClient: ExtendedWalletClient,
  initiateRemovalTxHash: Hex,
  delegationIDs?: Hex[],
  onProgress?: (msg: string) => void,
): Promise<void> {
  const progress = (msg: string) => { logger.log(msg); onProgress?.(msg); };

  progress('Step 1/4: Parsing delegator removal receipt...');
  const parsed = await (async () => {
    const { validatorManagerAddress } = await getValidatorManagerInfo(client, stakingVault);
    const validatorManager = await getValidatorManager(client, validatorManagerAddress);
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);
    const allRemovals = parseEventLogs({ abi: StakingVaultABI, logs: receipt.logs, eventName: 'StakingVault__DelegatorRemovalInitiated' });
    if (allRemovals.length === 0) throw new Error('No StakingVault__DelegatorRemovalInitiated event found in the transaction logs.');
    const toProcess = delegationIDs
      ? allRemovals.filter(e => { const id = e.args.delegationID; return id && delegationIDs.includes(id); })
      : allRemovals;
    if (toProcess.length === 0) throw new Error('No matching StakingVault__DelegatorRemovalInitiated event found for the provided delegationIDs.');
    return { receipt, toProcess, validatorManager };
  })().catch(error => {
    throw new Error(`[svCompleteDelegatorRemoval] Step 1 failed — parseReceipt: ${error instanceof Error ? error.message : String(error)}`);
  });
  const { receipt, toProcess, validatorManager } = parsed;
  const allWarpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
  progress(`Step 1/4: Done. Found ${toProcess.length} delegator removal(s) to process.`);

  let lastHash: Hex | undefined;
  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    const delegationID = event.args.delegationID;
    if (!delegationID) { logger.error('No delegationID in StakingVault__DelegatorRemovalInitiated event.'); continue; }
    const prefix = `[delegator ${i + 1}/${toProcess.length} delegationID=${delegationID}]`;

    const delegatorInfo = await stakingVault.read.getDelegatorInfo([delegationID]);
    const validationID = delegatorInfo.validationID;
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeID = encodeNodeID(validator.nodeID as Hex);

    const weightUpdates = parseEventLogs({ abi: ValidatorManagerABI, logs: receipt.logs, eventName: 'InitiatedValidatorWeightUpdate' })
      .filter(e => e.args.validationID === validationID);
    if (weightUpdates.length === 0) { logger.error(`${prefix} No InitiatedValidatorWeightUpdate event found`); continue; }

    const warpLog = allWarpLogs.find(w => w.args.messageID === weightUpdates[0].args.weightUpdateMessageID);
    if (!warpLog) { logger.error(`${prefix} No matching warp log found`); continue; }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);
    const { weight, nonce } = weightUpdates[0].args;

    progress(`${prefix} Step 2/4: Collecting C-Chain weight signatures...`);
    let signedL1ValidatorWeightMessage: string;
    try {
      signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: warpLog.args.message, signingSubnetId });
    } catch (error) {
      throw new Error(`[svCompleteDelegatorRemoval] ${prefix} Step 2 failed — collectCChainSignatures: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`[svCompleteDelegatorRemoval] ${prefix} Step 3 failed — setWeightOnPChain: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (weightSkipped) progress(`${prefix} Step 3/4: Skipped — weight already set (stale nonce).`);

    progress(`${prefix} Step 4/4: Collecting P-Chain signatures and completing removal...`);
    let hash: Hex;
    try {
      const networkID = client.network === 'fuji' ? 5 : 1;
      const validationIDBytes = hexToBytes(validationID as Hex);
      const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), networkID, pChainChainID);
      const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);
      const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: unsignedPChainWarpMsgHex, signingSubnetId });
      const accessList = packWarpIntoAccessList(hexToBytes(`0x${signedPChainMessage}`));
      hash = await stakingVault.safeWrite.completeDelegatorRemoval([delegationID, 0], { chain: null, accessList });
    } catch (error) {
      throw new Error(`[svCompleteDelegatorRemoval] ${prefix} Step 4 failed — completeRemoval: ${error instanceof Error ? error.message : String(error)}`);
    }
    progress(`${prefix} Step 4/4: Done. tx hash=${hash}`);
    lastHash = hash;
  }

  if (!lastHash) throw new Error('No delegator removals processed');
}

export async function svClaimOperatorFees(
  stakingVault: IContract<TStakingVaultABI, 'claimOperatorFees'>,
): Promise<Hex> {
  return stakingVault.safeWrite.claimOperatorFees([]);
}
