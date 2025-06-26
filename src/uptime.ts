import { packValidationUptimeMessage, collectSignatures } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';
import { hexToBytes, Hex } from 'viem';
import { packWarpIntoAccessList } from './lib/warpUtils';
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from 'viem';
import { Network } from "./client";

export async function getValidationUptimeMessage(
  network: Network,
  rpcUrl: string,
  nodeId: string,
  networkID: number,
  sourceChainID: string,
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

  const validationID = data.result.validators[0].validationID;
  const uptimeSeconds = data.result.validators[0].uptimeSeconds;

  const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
  const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
  console.log("Unsigned Validation Uptime Message: ", unsignedValidationUptimeMessageHex);

  const signedValidationUptimeMessage = await collectSignatures(network, unsignedValidationUptimeMessageHex);
  console.log("Signed Validation Uptime Message: ", signedValidationUptimeMessage);

  return signedValidationUptimeMessage;
}


export async function computeValidatorUptime(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  account: Account | undefined,
  signedUptimeHex: Hex
) {
  if (!account) throw new Error('Client account is required');
  // 2) Convert aggregator signature => bytes => accessList
  const warpBytes = hexToBytes(signedUptimeHex);
  const accessList = packWarpIntoAccessList(warpBytes);

  const txHash = await uptimeTracker.safeWrite.computeValidatorUptime(
    [0],
    { chain: null, account, accessList }
  );

  console.log("computeValidatorUptime done, tx hash:", txHash);
  return txHash;
}


// New orchestrator function
export async function reportAndSubmitValidatorUptime(
  // Parameters for getting the uptime message
  network: Network,
  rpcUrl: string,
  nodeId: string,
  warpNetworkID: number, // Avalanche Network ID (1 for Mainnet, 5 for Fuji)
  sourceChainID: string, // The chain ID for which uptime is being reported
  // Parameters for submitting to the contract
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  account: Account | undefined
) {
  console.log(`Starting validator uptime report for NodeID: ${nodeId} on source chain ${sourceChainID} via RPC ${rpcUrl}`);
  console.log(`Target UptimeTracker: ${uptimeTracker.address}`);

  // Step 1: Get the signed validation uptime message
  let signedUptimeHex = await getValidationUptimeMessage(
    network,
    rpcUrl,
    nodeId,
    warpNetworkID,
    sourceChainID
  );

  console.log(`Raw Signed Uptime Message from getValidationUptimeMessage: ${signedUptimeHex}`); // Log raw value for debugging

  // Ensure signedUptimeHex is a string and normalize it to have "0x" prefix
  if (typeof signedUptimeHex === 'string') {
    if (!signedUptimeHex.startsWith('0x')) {
      signedUptimeHex = `0x${signedUptimeHex}`; // Prepend "0x" if missing
    }
  } else {
    // If it's not a string at all (e.g., undefined, null from a failed collectSignatures)
    console.error("getValidationUptimeMessage did not return a string for the signed message.");
    throw new Error("Failed to obtain a valid signed uptime hex message (not a string).");
  }

  // Now the check should pass if it was only about the "0x" prefix
  if (!signedUptimeHex || typeof signedUptimeHex !== 'string' || !signedUptimeHex.startsWith('0x') || signedUptimeHex.length <= 2) { // Added length check
    // This error should ideally not be hit if the above normalization works
    // and if getValidationUptimeMessage returns a non-empty hex string.
    console.error(`Problematic signedUptimeHex after normalization: '${signedUptimeHex}'`);
    throw new Error("Failed to obtain a valid signed uptime hex message (post-normalization check failed).");
  }

  console.log(`\nStep 1 complete. Normalized Signed Uptime Hex: ${signedUptimeHex}`);

  // Step 2: Submit this message to the UptimeTracker contract
  console.log("\nStep 2: Submitting uptime to the UptimeTracker contract...");
  const txHash = await computeValidatorUptime(
    uptimeTracker,
    account,
    signedUptimeHex as Hex
  );

  console.log("\nValidator uptime report and submission complete.");
  console.log("Final Transaction Hash:", txHash);
  return txHash;
}

/**
 * Compute uptime for an operator at a specific epoch
 */
export async function computeOperatorUptimeAtEpoch(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  operator: Hex,
  epoch: number,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  const txHash = await uptimeTracker.safeWrite.computeOperatorUptimeAt(
    [operator, epoch],
    { chain: null, account }
  );

  console.log(`computeOperatorUptimeAt for epoch ${epoch} done, tx hash: ${txHash}`);
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
  account: Account | undefined,
  initialNonce?: number
) {
  if (!account) throw new Error('Client account is required');
  let currentNonce = initialNonce ?? 0;

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    const txHash = await uptimeTracker.safeWrite.computeOperatorUptimeAt(
      [operator, epoch],
      { chain: null, account, nonce: currentNonce }
    );
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
