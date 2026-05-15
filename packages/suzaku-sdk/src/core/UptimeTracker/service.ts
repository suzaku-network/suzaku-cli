import { hexToBytes, type Hex, type Address } from 'viem';
import { bytesToHex } from '@noble/hashes/utils';
import type { IContract, IReadContract } from '../client/contract';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { TUptimeTrackerABI } from './abi';
import type { TL1MiddlewareABI } from '../L1Middleware/abi';
import { packValidationUptimeMessage, collectSignatures, packWarpIntoAccessList } from '../lib/warpUtils';
import { validatedBy } from '../lib/pChainUtils';
import { cb58ToHex } from '../lib/avalancheUtils';
import { logger } from '../logger';

type CurrentValidator = {
  validationID: string;
  nodeID: string;
  weight: number;
  startTimestamp: number;
  isActive: boolean;
  isL1Validator: boolean;
  isConnected: boolean;
  uptimePercentage: number;
  uptimeSeconds: number;
};

type getCurrentValidatorsRpcResponse = {
  result: { validators: CurrentValidator[] };
  error?: unknown;
};

export async function getCurrentValidatorsFromNode(rpcUrl: string, bypassToken?: string): Promise<CurrentValidator[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bypassToken) {
    logger.log('Using RPC bypass token');
    headers['x-rpc-bypass-token'] = bypassToken;
  }
  const response = await fetch(rpcUrl + '/validators', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'validators.getCurrentValidators', params: { nodeIDs: [] }, id: 1 }),
  });
  const data = await response.json() as getCurrentValidatorsRpcResponse;
  if (data.error) throw new Error('Error from validators.getCurrentValidators: ' + JSON.stringify(data.error));
  return data.result.validators;
}

export async function getValidationUptimeMessage(
  client: ExtendedClient,
  rpcUrl: string,
  nodeId: string,
  networkID: number,
  sourceChainID: string,
  bypassToken?: string,
): Promise<string> {
  const validators = await getCurrentValidatorsFromNode(rpcUrl, bypassToken);
  const validator = validators.find(v => v.nodeID === nodeId);
  if (!validator) throw new Error('Validator not found for nodeID: ' + nodeId);

  const { validationID, uptimeSeconds } = validator;
  logger.log(`Validator ${nodeId} has validationID ${validationID} and uptimeSeconds ${uptimeSeconds} on network ${networkID} for source chain ${sourceChainID}`);

  const unsignedMsg = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
  const unsignedMsgHex = bytesToHex(unsignedMsg);
  logger.log('Unsigned Validation Uptime Message: ', unsignedMsgHex);

  const signingSubnetId = await validatedBy(client, sourceChainID);
  const signedMsg = await collectSignatures({ network: client.network, message: unsignedMsgHex, signingSubnetId });
  logger.log('Signed Validation Uptime Message: ', signedMsg);

  return signedMsg;
}

export async function computeValidatorUptime(
  uptimeTracker: IContract<TUptimeTrackerABI, 'computeValidatorUptime'>,
  signedUptimeHex: Hex,
): Promise<Hex> {
  const warpBytes = hexToBytes(signedUptimeHex);
  const accessList = packWarpIntoAccessList(warpBytes);
  const txHash = await uptimeTracker.safeWrite.computeValidatorUptime([0], { accessList });
  logger.log('computeValidatorUptime done, tx hash:', txHash);
  return txHash;
}

function normalizeHex(value: string): Hex {
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  if (!hex || hex.length <= 2) throw new Error('Failed to obtain a valid signed uptime hex message.');
  return hex as Hex;
}

export async function syncUptime(
  client: ExtendedWalletClient,
  uptimeTracker: IContract<TUptimeTrackerABI, 'computeValidatorUptime' | 'computeOperatorUptimeAt' | 'isValidatorUptimeSet' | 'isOperatorUptimeSet'>,
  middleware: IReadContract<TL1MiddlewareABI, 'getCurrentEpoch' | 'getAllOperators' | 'getOperatorValidationIDs' | 'getActiveNodesForEpoch'>,
  rpcUrl: string,
  blockchainId: string,
  bypassToken?: string,
): Promise<void> {
  const targetEpoch = Number(await middleware.read.getCurrentEpoch());
  logger.log(`Checking uptime status for epoch ${targetEpoch}...`);

  const operators = await middleware.read.getAllOperators();
  if (operators.length === 0) {
    logger.log('No operators found.');
    return;
  }

  let currentValidators = await getCurrentValidatorsFromNode(rpcUrl, bypassToken);
  if (currentValidators.length === 0) {
    logger.log('No validators found for any operator.');
    return;
  }

  const allValidationIDs = (
    await middleware.multicall(operators.map(op => ({ name: 'getOperatorValidationIDs' as const, args: [op] as [Address] })))
  ).flat();
  currentValidators = currentValidators.filter(v => allValidationIDs.includes(cb58ToHex(v.validationID)));

  const uptimeStatus = await uptimeTracker.multicall(
    currentValidators.map(v => ({ name: 'isValidatorUptimeSet' as const, args: [targetEpoch, cb58ToHex(v.validationID)] as [number, Hex] })),
  );

  const signingSubnetId = await validatedBy(client, blockchainId);
  const networkID = client.network === 'mainnet' ? 1 : 5;

  for (const [index, validator] of currentValidators.entries()) {
    const { validationID, nodeID, uptimeSeconds } = validator;
    if (!uptimeStatus[index]) {
      logger.log(`Reporting uptime for validator ${validationID} (${nodeID})...`);
      const unsignedMsg = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, blockchainId);
      const unsignedMsgHex = bytesToHex(unsignedMsg);
      const signed = await collectSignatures({ network: client.network, message: unsignedMsgHex, signingSubnetId });
      if (typeof signed !== 'string') throw new Error('Failed to obtain a valid signed uptime hex message (not a string).');
      const signedHex = normalizeHex(signed);

      const warpBytes = hexToBytes(signedHex);
      const accessList = packWarpIntoAccessList(warpBytes);
      const txHash = await uptimeTracker.safeWrite.computeValidatorUptime([0], { accessList, chain: null });
      logger.log(`computeValidatorUptime done, tx hash: ${txHash}`);
      logger.addData('computeValidatorUptime', { validationID, nodeID, txHash });
    }
  }

  logger.log('All validators have reported their uptime for epoch ' + targetEpoch);

  const epochsToCheck = targetEpoch < 50 ? targetEpoch : 50;
  const epochRange = Array.from({ length: epochsToCheck }, (_, i) => targetEpoch - i - 1);

  let operatorUptimeStatus = await uptimeTracker.multicall(
    operators.flatMap(op => epochRange.map(epoch => ({ name: 'isOperatorUptimeSet' as const, args: [epoch, op] as [number, Address] }))),
  );

  const operatorHadValidator = await middleware.multicall(
    operators.flatMap(op => epochRange.map(epoch => ({ name: 'getActiveNodesForEpoch' as const, args: [op, epoch] as [Address, number] }))),
  );
  operatorUptimeStatus = operatorUptimeStatus.map((status, index) => operatorHadValidator[index].length > 0 ? status : true);

  for (const [index, operator] of operators.entries()) {
    const operatorEpochStatus = operatorUptimeStatus.slice(index * epochsToCheck, (index + 1) * epochsToCheck);
    const missingEpochs = epochRange.filter((_, i) => !operatorEpochStatus[i]);
    if (missingEpochs.length > 0) {
      logger.log(`Operator ${operator} has missing uptime reports`);
      logger.addData('missingOperatorUptime', { operator, epochs: missingEpochs });
      try {
        for (const epoch of missingEpochs) {
          await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);
        }
      } catch (error) {
        logger.error(`Error computing uptime for operator ${operator}:`, error);
      }
    } else {
      logger.log(`Operator ${operator} has uptime reports for all of the last ${epochsToCheck} epochs.`);
    }
  }

  logger.log('All operators have their uptime reported for the last ' + epochsToCheck + ' epochs from ' + targetEpoch + '.');
}
