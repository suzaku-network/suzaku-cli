import { packValidationUptimeMessage, collectSignatures, packWarpIntoAccessList } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';
import { hexToBytes, Hex } from 'viem';
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from 'viem';
import { generateClient, Network } from "./client";
import { logger } from './lib/logger';
import { validatedBy } from "./lib/pChainUtils";

export async function getValidationUptimeMessage(
  network: Network,
  rpcUrl: string,
  nodeId: string,
  networkID: number,
  sourceChainID: string
) {
  // Perform a POST request to rpcUrl/validators, payload is {jsonrpc: "2.0", method: "validators.getCurrentValidators", params: { nodeIDs: [...] }, id: 1}
  const response = await fetch(rpcUrl + "/validators", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "validators.getCurrentValidators",
      params: {
        nodeIDs: [nodeId],
      },
      id: 1,
    }),
  });
  const data = await response.json();
  if (data.error) logger.exitError(["Error from validators.getCurrentValidators:", data.error])
  if (!data.result.validators[0]) logger.exitError(["Validator not found for nodeID: ", nodeId])
  const validator = data.result.validators[0];
  const validationID = validator.validationID;
  const uptimeSeconds = validator.uptimeSeconds;
  logger.log(`Validator ${nodeId} has validationID ${validationID} and uptimeSeconds ${uptimeSeconds}`);

  const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
  const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
  logger.log("Unsigned Validation Uptime Message: ", unsignedValidationUptimeMessageHex);

  const client = await generateClient(network)
  const signingSubnetId = await validatedBy(client, sourceChainID)
  logger.log("Signing Subnet ID: ", signingSubnetId);
  const signedValidationUptimeMessage = await collectSignatures({ network, message: unsignedValidationUptimeMessageHex, subnetId: signingSubnetId });
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

  const txHash = await uptimeTracker.write.computeValidatorUptime([0]);

  logger.log("computeValidatorUptime done, tx hash:", txHash);
  return txHash;
}


// New orchestrator function
export async function reportAndSubmitValidatorUptime(
  // Parameters for getting the uptime message
  network: Network,
  rpcUrl: string,
  nodeId: string,
  sourceChainID: string, // The chain ID for which uptime is being reported
  // Parameters for submitting to the contract
  uptimeTracker: SafeSuzakuContract['UptimeTracker']
) {
  logger.log(`Starting validator uptime report for NodeID: ${nodeId} on source chain ${sourceChainID} via RPC ${rpcUrl}`);
  logger.log(`Target UptimeTracker: ${uptimeTracker.address}`);

  const warpNetworkID = network === 'mainnet' ? 1 : 5; // Mainnet or Fuji

  // Step 1: Get the signed validation uptime message
  let signedUptimeHex = await getValidationUptimeMessage(
    network,
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
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
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
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
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
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
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
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
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
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  validationID: Hex
) {
  return await uptimeTracker.read.getLastUptimeCheckpoint(
    [validationID]
  );
}
