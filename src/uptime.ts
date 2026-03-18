import { packValidationUptimeMessage, collectSignatures, packWarpIntoAccessList } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';
import { hexToBytes, Hex } from 'viem';
import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { ExtendedClient, Network } from "./client";
import { logger } from './lib/logger';
import { getCurrentValidators, validatedBy } from "./lib/pChainUtils";
import { utils } from "@avalabs/avalanchejs";
import { cb58ToHex } from "./lib/utils";
import { pChainChainID } from "./config";

type getCurrentValidatorsRpcResponse = {
  result: {
    "validators": {
      "validationID": string,
      "nodeID": string,
      "weight": number,
      "startTimestamp": number,
      "isActive": boolean,
      "isL1Validator": boolean,
      "isConnected": boolean,
      "uptimePercentage": number,
      "uptimeSeconds": number
    }[],
  }
  error?: any
}

export async function getCurrentValidatorsFromNode(rpcUrl: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.RPC_BYPASS_TOKEN) {
    logger.log("Using RPC bypass token");
    headers["x-rpc-bypass-token"] = process.env.RPC_BYPASS_TOKEN;
  }
  const response = await fetch(rpcUrl + "/validators", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "validators.getCurrentValidators",
      params: {
        nodeIDs: [],
      },
      id: 1,
    }),
  });
  const data = await response.json() as getCurrentValidatorsRpcResponse;
  if (data.error) logger.exitError(["Error from validators.getCurrentValidators:", data.error])
  return data.result.validators;
}

export async function getValidationUptimeMessage(
  client: ExtendedClient,
  rpcUrl: string,
  nodeId: string,
  networkID: number,
  sourceChainID: string
) {
  // Perform a POST request to rpcUrl/validators, payload is {jsonrpc: "2.0", method: "validators.getCurrentValidators", params: { nodeIDs: [...] }, id: 1}
  const validators = await getCurrentValidatorsFromNode(rpcUrl);
  const validator = validators.find(v => v.nodeID === nodeId);
  if (!validator) throw new Error("Validator not found for nodeID: " + nodeId);
  const validationID = validator.validationID;
  const uptimeSeconds = validator.uptimeSeconds;
  logger.log(`Validator ${nodeId} has validationID ${validationID} and uptimeSeconds ${uptimeSeconds} on network ${networkID} for source chain ${sourceChainID}`);

  const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
  const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
  logger.log("Unsigned Validation Uptime Message: ", unsignedValidationUptimeMessageHex);

  const signingSubnetId = await validatedBy(client, sourceChainID)
  const signedValidationUptimeMessage = await collectSignatures({ network: client.network, message: unsignedValidationUptimeMessageHex, signingSubnetId });
  logger.log("Signed Validation Uptime Message: ", signedValidationUptimeMessage);

  return signedValidationUptimeMessage;
}


export async function computeValidatorUptime(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  signedUptimeHex: Hex
) {

  // 2) Convert aggregator signature => bytes => accessList
  const warpBytes = hexToBytes(signedUptimeHex);
  const accessList = packWarpIntoAccessList(warpBytes);

  const txHash = await uptimeTracker.write.computeValidatorUptime([0], { accessList, chain: null });

  logger.log("computeValidatorUptime done, tx hash:", txHash);
  return txHash;
}


// New orchestrator function
export async function reportAndSubmitValidatorUptime(
  // Parameters for getting the uptime message
  client: ExtendedClient,
  rpcUrl: string,
  nodeId: string,
  sourceChainID: string, // The chain ID for which uptime is being reported
  // Parameters for submitting to the contract
  uptimeTracker: SafeSuzakuContract['UptimeTracker']
) {
  logger.log(`Starting validator uptime report for NodeID: ${nodeId} on source chain ${sourceChainID} via RPC ${rpcUrl}`);
  logger.log(`Target UptimeTracker: ${uptimeTracker.address}`);

  const warpNetworkID = client.network === 'mainnet' ? 1 : 5; // Mainnet or Fuji

  // Step 1: Get the signed validation uptime message
  let signedUptimeHex = await getValidationUptimeMessage(
    client,
    rpcUrl,
    nodeId,
    warpNetworkID,
    sourceChainID
  );

  logger.log(`Raw Signed Uptime Message from getValidationUptimeMessage: ${signedUptimeHex}`); // Log raw value for debugging

  // Ensure signedUptimeHex is a string and normalize it to have "0x" prefix
  if (typeof signedUptimeHex === 'string') {
    if (!signedUptimeHex.startsWith('0x')) {
      signedUptimeHex = `0x${signedUptimeHex}`; // Prepend "0x" if missing
    }
  } else {
    // If it's not a string at all (e.g., undefined, null from a failed collectSignatures)
    logger.error("getValidationUptimeMessage did not return a string for the signed message.");
    throw new Error("Failed to obtain a valid signed uptime hex message (not a string).");
  }

  // Now the check should pass if it was only about the "0x" prefix
  if (!signedUptimeHex || typeof signedUptimeHex !== 'string' || !signedUptimeHex.startsWith('0x') || signedUptimeHex.length <= 2) { // Added length check
    // This error should ideally not be hit if the above normalization works
    // and if getValidationUptimeMessage returns a non-empty hex string.
    logger.error(`Problematic signedUptimeHex after normalization: '${signedUptimeHex}'`);
    throw new Error("Failed to obtain a valid signed uptime hex message (post-normalization check failed).");
  }

  logger.log(`\nStep 1 complete. Normalized Signed Uptime Hex: ${signedUptimeHex}`);

  // Step 2: Submit this message to the UptimeTracker contract
  logger.log("\nStep 2: Submitting uptime to the UptimeTracker contract...");
  const txHash = await computeValidatorUptime(
    uptimeTracker,
    signedUptimeHex as Hex
  );

  logger.log("\nValidator uptime report and submission complete.");
  logger.log("Final Transaction Hash:", txHash);
  return txHash;
}

/**
 * Compute uptime for an operator at a specific epoch
 */
export async function computeOperatorUptimeAtEpoch(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  operator: Hex,
  epoch: number
) {


  const txHash = await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);

  logger.log(`computeOperatorUptimeAt for epoch ${epoch} done, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Compute uptime for an operator across multiple epochs
 */
export async function computeOperatorUptimeForEpochs(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  operator: Hex,
  startEpoch: number,
  endEpoch: number,
  initialNonce?: number
) {

  let currentNonce = initialNonce ?? 0;

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);
    currentNonce++;
  }
}

/**
 * Get validator uptime for a specific epoch
 */
export async function getValidatorUptimeForEpoch(
  uptimeTracker: SuzakuContract['UptimeTracker'],
  validationID: Hex,
  epoch: number
) {
  return await uptimeTracker.read.validatorUptimePerEpoch(
    [epoch, validationID]
  );
}

/**
 * Check if validator uptime is set for a specific epoch
 */
export async function isValidatorUptimeSetForEpoch(
  uptimeTracker: SuzakuContract['UptimeTracker'],
  validationID: Hex,
  epoch: number
) {
  return await uptimeTracker.read.isValidatorUptimeSet(
    [epoch, validationID]
  );
}

/**
 * Get operator uptime for a specific epoch
 */
export async function getOperatorUptimeForEpoch(
  uptimeTracker: SuzakuContract['UptimeTracker'],
  operator: Hex,
  epoch: number
) {
  return await uptimeTracker.read.operatorUptimePerEpoch(
    [epoch, operator]
  );
}

/**
 * Check if operator uptime is set for a specific epoch
 */
export async function isOperatorUptimeSetForEpoch(
  uptimeTracker: SuzakuContract['UptimeTracker'],
  operator: Hex,
  epoch: number
) {
  return await uptimeTracker.read.isOperatorUptimeSet(
    [epoch, operator]
  );
}

/**
 * Get last uptime checkpoint for a validator
 */
export async function getLastUptimeCheckpoint(
  uptimeTracker: SuzakuContract['UptimeTracker'],
  validationID: Hex
) {
  return await uptimeTracker.read.getLastUptimeCheckpoint(
    [validationID]
  );
}

/**
 * Check if all alive validators from all operators have reported its uptime for the epoch and then check if all operators have reported their uptime for each epoch in the last 50 epochs (or since genesis if less than 50 epochs have passed). If not, report the uptime for the operators that haven't reported yet.
 */
export async function uptimeSync(
  client: ExtendedClient,
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  middleware: SafeSuzakuContract['L1Middleware'],
  rpcUrl: string,
  sourceChainID: string
) {

  const targetEpoch = Number(await middleware.read.getCurrentEpoch());
  logger.log(`Checking uptime status for epoch ${targetEpoch}...`);

  const operators = await middleware.read.getAllOperators();
  if (operators.length === 0) {
    logger.log("No operators found.");
    return;
  }

  let currentValidators = await getCurrentValidatorsFromNode(rpcUrl + `/ext/bc/${sourceChainID}`);
  if (currentValidators.length === 0) {
    logger.log("No validators found for any operator.");
    return;
  }

  // filter PoA validators
  const allValidationIDs = (await middleware.multicall(operators.map(op => ({ name: "getOperatorValidationIDs", args: [op] })))).flat();
  currentValidators = currentValidators.filter(v => allValidationIDs.includes(cb58ToHex(v.validationID)));

  // Check uptime status and get validator details in parallel structure
  const uptimeStatus = await uptimeTracker.multicall(
    currentValidators.map(v => ({ name: 'isValidatorUptimeSet', args: [targetEpoch, cb58ToHex(v.validationID)] }))
  )

  const signingSubnetId = await validatedBy(client, sourceChainID);
  const networkID = client.network === 'mainnet' ? 1 : 5;

  for (const [index, validator] of currentValidators.entries()) {
    const { validationID, nodeID, uptimeSeconds } = validator;
    const status = uptimeStatus[index];

    if (!status) {
      // get validator uptime
      logger.log(`Reporting uptime for validator ${validationID} (${nodeID})...`);
      const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
      const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
      let signedUptimeHex = await collectSignatures({ network: client.network, message: unsignedValidationUptimeMessageHex, signingSubnetId });
      // compute validator uptime

      // Ensure signedUptimeHex is a string and normalize it to have "0x" prefix
      if (typeof signedUptimeHex === 'string') {
        if (!signedUptimeHex.startsWith('0x')) {
          signedUptimeHex = `0x${signedUptimeHex}`; // Prepend "0x" if missing
        }
      } else {
        // If it's not a string at all (e.g., undefined, null from a failed collectSignatures)
        logger.error("getValidationUptimeMessage did not return a string for the signed message.");
        throw new Error("Failed to obtain a valid signed uptime hex message (not a string).");
      }

      // Now the check should pass if it was only about the "0x" prefix
      if (!signedUptimeHex || typeof signedUptimeHex !== 'string' || !signedUptimeHex.startsWith('0x') || signedUptimeHex.length <= 2) { // Added length check
        // This error should ideally not be hit if the above normalization works
        // and if getValidationUptimeMessage returns a non-empty hex string.
        logger.error(`Problematic signedUptimeHex after normalization: '${signedUptimeHex}'`);
        throw new Error("Failed to obtain a valid signed uptime hex message (post-normalization check failed).");
      }

      const warpBytes = hexToBytes(signedUptimeHex);
      const accessList = packWarpIntoAccessList(warpBytes);

      const txHash = await uptimeTracker.safeWrite.computeValidatorUptime([0], { accessList, chain: null });
      logger.log(`computeValidatorUptime done, tx hash: ${txHash}`);
      logger.addData('computeValidatorUptime', { validationID, nodeID, txHash });
    }
  };

  logger.log("All validators have reported their uptime for epoch " + targetEpoch);
  // Report all operators uptime status for each epoch (check if it's needed)

  // build an indexing of operators status upon 50 epochs (except if the targetEpoch is less than 50.
  const epochsToCheck = targetEpoch < 50 ? targetEpoch : 50;
  const epochRange = Array.from({ length: epochsToCheck }, (_, i) => targetEpoch - i - 1);
  let operatorUptimeStatus = await uptimeTracker.multicall(
    operators.flatMap(op => epochRange.map(epoch => ({ name: 'isOperatorUptimeSet', args: [epoch, op] })))
  );

  // If the operator had no validator for that epoch, we consider uptime as "set" to avoid reverting on `UptimeTracker__NoValidators`
  const operatorHadValidator = await middleware.multicall(operators.flatMap(op => epochRange.map(epoch => ({ name: 'getActiveNodesForEpoch', args: [op, epoch] }))));
  operatorUptimeStatus = operatorUptimeStatus.map((activeNodes, index) => operatorHadValidator[index].length > 0 ? activeNodes : true);

  // scan all epoch for all operator and report the uptime for each epoch the operator has uptime set to false
  for (const [index, operator] of operators.entries()) {
    const operatorEpochStatus = operatorUptimeStatus.slice(index * epochsToCheck, (index + 1) * epochsToCheck);
    const operatorEpochsWithoutUptime = epochRange.filter((_, i) => !operatorEpochStatus[i]);
    if (operatorEpochsWithoutUptime.length > 0) {
      logger.log(`Operator ${operator} has missing uptime reports`);
      try {
        for (const epoch of operatorEpochsWithoutUptime) {
          await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);
        }
      } catch (error) {
        logger.error(`Error computing uptime for operator ${operator}:`, error);
      }
    } else {
      logger.log(`Operator ${operator} has uptime reports for all of the last ${epochsToCheck} epochs.`);
    }
  }
  logger.log("All operators have their uptime reported for the last " + epochsToCheck + " epochs from " + targetEpoch + ".");
}
