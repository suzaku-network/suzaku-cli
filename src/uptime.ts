import { packValidationUptimeMessage, collectSignatures } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';
import { hexToBytes, Hex } from 'viem';
import { packWarpIntoAccessList } from './lib/warpUtils';
import { generateClient, Network } from './client';
import { getConfig } from './config';

export async function getValidationUptimeMessage(
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

  const signedValidationUptimeMessage = await collectSignatures(unsignedValidationUptimeMessageHex);
  console.log("Signed Validation Uptime Message: ", signedValidationUptimeMessage);

  return signedValidationUptimeMessage;
}


export async function computeValidatorUptime(
  uptimeTrackerAddress: Hex,
  signedUptimeHex: Hex,
  messageIndex: number,
  privateKey: Hex,
  network: Network
) {
  // 1) Get config + generate the wallet client
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  // 2) Convert aggregator signature => bytes => accessList
  const warpBytes = hexToBytes(signedUptimeHex);
  const accessList = packWarpIntoAccessList(warpBytes);

  // 3) Write contract call
  const txHash = await client.writeContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'computeValidatorUptime',
    args: [BigInt(messageIndex)],
    account: client.account,
    chain: null,
    accessList
  });

  console.log("computeValidatorUptime done, tx hash:", txHash);
  return txHash;
}


// New orchestrator function
export async function reportAndSubmitValidatorUptime(
  // Parameters for getting the uptime message
  rpcUrl: string,
  nodeId: string,
  warpNetworkID: number, // Avalanche Network ID (1 for Mainnet, 5 for Fuji)
  sourceChainID: string, // The chain ID for which uptime is being reported
  // Parameters for submitting to the contract
  uptimeTrackerAddress: Hex,
  messageIndex: number,
  // Common parameters (from CLI opts)
  privateKey: Hex,
  cliNetwork: Network // e.g., "fuji", "anvil"
) {
  console.log(`Starting validator uptime report for NodeID: ${nodeId} on source chain ${sourceChainID} via RPC ${rpcUrl}`);
  console.log(`Target UptimeTracker: ${uptimeTrackerAddress} on ${cliNetwork} network.`);

  // Step 1: Get the signed validation uptime message
  let signedUptimeHex = await getValidationUptimeMessage(
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
    uptimeTrackerAddress,
    signedUptimeHex as Hex,
    messageIndex,
    privateKey,
    cliNetwork
  );

  console.log("\nValidator uptime report and submission complete.");
  console.log("Final Transaction Hash:", txHash);
  return txHash;
}

/**
 * Compute uptime for an operator at a specific epoch
 */
export async function computeOperatorUptimeAtEpoch(
  uptimeTrackerAddress: Hex,
  operator: Hex,
  epoch: number,
  privateKey: Hex,
  network: Network
) {
  // Get config + generate the wallet client
  const config = getConfig(network);
  const client = generateClient(network, privateKey)

  if (!client.account) {
    throw new Error("No client account set.");
  }

  // Write contract call
  const txHash = await client.writeContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'computeOperatorUptimeAt',
    args: [operator, BigInt(epoch)],
    account: client.account,
    chain: null
  });

  console.log(`computeOperatorUptimeAt for epoch ${epoch} done, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Compute uptime for an operator across multiple epochs
 */
export async function computeOperatorUptimeForEpochs(
  uptimeTrackerAddress: Hex,
  operator: Hex,
  startEpoch: number,
  endEpoch: number,
  privateKey: Hex,
  network: Network
) {
  console.log(`Computing operator uptime for ${operator} from epoch ${startEpoch} to ${endEpoch}`);
  const txHashes = [];

  // Get config and generate the wallet client
  const config = getConfig(network);
  const client = generateClient(network, privateKey)

  if (!client.account) {
    throw new Error("No client account set.");
  }

  // Get the current nonce once at the beginning
  let currentNonce = await client.getTransactionCount({
    address: client.account.address
  });

  console.log(`Starting with nonce: ${currentNonce}`);

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    // Add retry logic
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let success = false;

    while (retryCount < MAX_RETRIES && !success) {
      try {
        console.log(`Processing epoch ${epoch} with nonce ${currentNonce} (attempt ${retryCount + 1}/${MAX_RETRIES})`);

        // Make the contract call with explicit nonce
        const txHash = await client.writeContract({
          address: uptimeTrackerAddress,
          abi: config.abis.UptimeTracker,
          functionName: 'computeOperatorUptimeAt',
          args: [operator, BigInt(epoch)],
          account: client.account,
          chain: null,
          nonce: currentNonce // Explicitly set the nonce
        });

        txHashes.push({ epoch, txHash });
        console.log(`computeOperatorUptimeAt for epoch ${epoch} done, tx hash: ${txHash}`);

        // Increment nonce for next transaction
        currentNonce++;

        // Mark as successful
        success = true;

        // Small delay to give the network some breathing room
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        retryCount++;
        console.error(`Error computing uptime for epoch ${epoch} (attempt ${retryCount}/${MAX_RETRIES}):`, error);

        // If we hit a nonce error, recover by getting the current nonce
        if (error && typeof error === 'object' && error.message && typeof error.message === 'string' && error.message.includes('nonce too low')) {
          try {
            const newNonce = await client.getTransactionCount({
              address: client.account.address
            });
            console.log(`Nonce was incorrect. Updating from ${currentNonce} to ${newNonce}`);
            currentNonce = newNonce;
          } catch (nonceError) {
            console.error("Failed to update nonce:", nonceError);
          }
        }

        if (retryCount < MAX_RETRIES) {
          // Wait a bit longer between retries
          const retryDelay = 1000 * retryCount; // Increase delay with each retry
          console.log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.error(`Failed to process epoch ${epoch} after ${MAX_RETRIES} attempts. Stopping.`);
          return txHashes; // Stop the entire operation
        }
      }
    }
  }

  console.log("Operator uptime computation complete for all epochs.");
  return txHashes;
}

/**
 * Get validator uptime for a specific epoch
 */
export async function getValidatorUptimeForEpoch(
  uptimeTrackerAddress: Hex,
  validationID: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const uptime = await client.readContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'validatorUptimePerEpoch',
    args: [BigInt(epoch), validationID]
  });

  return uptime;
}

/**
 * Check if validator uptime is set for a specific epoch
 */
export async function isValidatorUptimeSetForEpoch(
  uptimeTrackerAddress: Hex,
  validationID: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const isSet = await client.readContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'isValidatorUptimeSet',
    args: [BigInt(epoch), validationID]
  });

  return isSet;
}

/**
 * Get operator uptime for a specific epoch
 */
export async function getOperatorUptimeForEpoch(
  uptimeTrackerAddress: Hex,
  operator: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const uptime = await client.readContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'operatorUptimePerEpoch',
    args: [BigInt(epoch), operator]
  });

  return uptime;
}

/**
 * Check if operator uptime is set for a specific epoch
 */
export async function isOperatorUptimeSetForEpoch(
  uptimeTrackerAddress: Hex,
  operator: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const isSet = await client.readContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'isOperatorUptimeSet',
    args: [BigInt(epoch), operator]
  });

  return isSet;
}

/**
 * Get last uptime checkpoint for a validator
 */
export async function getLastUptimeCheckpoint(
  uptimeTrackerAddress: Hex,
  validationID: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const checkpoint = await client.readContract({
    address: uptimeTrackerAddress,
    abi: config.abis.UptimeTracker,
    functionName: 'getLastUptimeCheckpoint',
    args: [validationID]
  });

  return checkpoint;
}
