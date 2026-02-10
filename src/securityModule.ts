import { Account, bytesToHex, Hex, hexToBytes, parseEventLogs } from "viem";
import { ExtendedWalletClient } from "./client";
import { Config, pChainChainID } from "./config";
import { SafeSuzakuContract } from "./lib/viemUtils";
import { encodeNodeID, NodeId, parseNodeID, retryWhileError } from "./lib/utils";
import { logger } from './lib/logger';
import { color } from "console-log-colors";
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from "./lib/warpUtils";
import { getCurrentValidators, registerL1Validator, setValidatorWeight } from "./lib/pChainUtils";
import { pipe, R } from "@mobily/ts-belt";
import { GetRegistrationJustification } from "./lib/justification";
import { utils } from "@avalabs/avalanchejs";

export async function completeValidatorRegistration(
  client: ExtendedWalletClient,
  pchainClient: ExtendedWalletClient,
  securityModule: SafeSuzakuContract['PoASecurityModule'] | SafeSuzakuContract['L1Middleware'],
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  config: Config,
  blsProofOfPossession: string,
  addNodeTxHash: Hex,
  initialBalance: bigint,
  waitValidatorVisible: boolean
) {
  logger.log("Completing validator registration...");

  // Wait for transaction receipt to extract warp message and validation ID
  const receipt = await client.waitForTransactionReceipt({ hash: addNodeTxHash });

  const InitiatedValidatorRegistration = parseEventLogs({
    abi: balancer.abi,
    logs: receipt.logs,
    eventName: 'InitiatedValidatorRegistration'
  })[0]

  if (!InitiatedValidatorRegistration) {
    logger.error(color.red("No InitiatedValidatorRegistration event found in the transaction logs, verify the transaction hash."));
    process.exit(1);
  }

  const warpLogs = parseEventLogs({
    abi: config.abis.IWarpMessenger,
    logs: receipt.logs,
  })[0]

  const nodeId = encodeNodeID(InitiatedValidatorRegistration.args.nodeID); // Convert bytes32 to NodeID format by removing the first 12 bytes
  // Check if the node is still registered as a validator on the P-Chain
  const subnetIDHex = await balancer.read.subnetID();
  const isValidator = (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeId);
  if (isValidator) {
    logger.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
  } else {
    // Get the unsigned warp message from the receipt
    const RegisterL1ValidatorUnsignedWarpMsg = warpLogs.args.message;

    // Collect signatures for the warp message
    logger.log("\nCollecting signatures for the L1ValidatorRegistrationMessage from the Validator Manager chain...");
    const signedMessage = await collectSignatures(client.network, RegisterL1ValidatorUnsignedWarpMsg);

    // Register validator on P-Chain
    logger.log("\nRegistering validator on P-Chain...");
    // eslint-disable-next-line
    pipe(await registerL1Validator({
      client: pchainClient,
      blsProofOfPossession: blsProofOfPossession,
      signedMessage,
      initialBalance: initialBalance
    }),
      R.tap(pChainTxId => logger.log("RegisterL1ValidatorTx executed on P-Chain:", pChainTxId))),
      R.tapError(err => { logger.error(err); process.exit(1) })
  }

  // Get the validation ID from the receipt logs
  const validationIDHex = InitiatedValidatorRegistration.args.validationID;
  // Pack and sign the P-Chain warp message
  const validationIDBytes = hexToBytes(validationIDHex as Hex);
  const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, client.network === 'fuji' ? 5 : 1, pChainChainID);
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

  // Aggregate signatures from validators
  logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
  const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex);

  // Convert the signed warp message to bytes and pack into access list
  const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
  const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

  logger.log("\nCalling function completeValidatorRegistration...");
  // TODO: Find a way to use the proper signature of the method
  const method = securityModule.safeWrite.completeValidatorRegistration as any;
  const hash = await method([0]);

  // Wait until the validator is visible on the P-Chain
  if (waitValidatorVisible) {
    logger.log("Waiting for the validator to be visible on the P-Chain (may take a while)...");
    await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeId), 5000, 180000, (res) => res === true);
  }

  logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
}

export async function completeValidatorRemoval(
  client: ExtendedWalletClient,
  pchainClient: ExtendedWalletClient,
  securityModule: SafeSuzakuContract['L1Middleware'] | SafeSuzakuContract['PoASecurityModule'],
  balancerValidatorManager: SafeSuzakuContract['BalancerValidatorManager'],
  config: Config,
  initializeEndValidationTxHash: Hex,
  waitValidatorVisible: boolean,
  nodeIDs?: NodeId[],
  addNodeTxHash?: Hex[]
) {
  logger.log("Completing validator removal...");

  // Wait for the removeNode transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage and validationID from the receipt
  const receipt = await client.waitForTransactionReceipt({ hash: initializeEndValidationTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initializeEndValidationTxHash} reverted, pls resend the removeNode transaction`);

  // Select the NodeRemoved events from the receipt, filter by nodeIDs if provided and if securityModule is L1Middleware
  let nodeRemoved: {
    args: {
      nodeId: Hex;
      validationID: Hex;
    },
    blockNumber: bigint;
  }[];
  if (securityModule.name === "L1Middleware") {
    nodeRemoved = parseEventLogs({
      abi: securityModule.abi,
      logs: receipt.logs,
      eventName: 'NodeRemoved'
    }).filter((e) => nodeIDs ? nodeIDs.includes(encodeNodeID(e.args.nodeId)) : true)

    if (nodeRemoved.length === 0) {
      logger.error(color.red("No matching NodeRemoved event found for the provided NodeIDs, verify the transaction hash and NodeIDs."));
      process.exit(1);
    }
  }
  // If securityModule is PoASecurityModule
  else {
    const validationId = parseEventLogs({
      abi: config.abis.ValidatorManager,
      logs: receipt.logs,
      eventName: 'InitiatedValidatorRemoval'
    })[0].args.validationID

    if (!validationId) {
      logger.error(color.red("No matching InitiatedValidatorRemoval event found for the provided NodeIDs, verify the transaction hash and NodeIDs."));
      process.exit(1);
    }

    const nodeID = (await balancerValidatorManager.read.getValidator([validationId])).nodeID;

    nodeRemoved = [{
      args: {
        nodeId: nodeID,
        validationID: validationId
      },
      blockNumber: BigInt(receipt.blockNumber), // Not going to be used in GetRegistrationJustification because the justification will be found in the ConvertSubnetToL1Tx
    }];
  }

  const initiatedValidatorRemovals = parseEventLogs({
    abi: balancerValidatorManager.abi,
    logs: receipt.logs,
    eventName: 'InitiatedValidatorRemoval'
  })
  const warpLogs = parseEventLogs({
    abi: config.abis.IWarpMessenger,
    logs: receipt.logs,
  })

  const subnetIDHex = await balancerValidatorManager.read.subnetID();
  const currentValidators = (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex))))

  for (const event of nodeRemoved) {
    const eventIndex = nodeRemoved.indexOf(event);
    const initiatedValidatorRemoval = initiatedValidatorRemovals.find((e) => e.args.validationID === event.args.validationID)!;
    const warpLog = warpLogs.find((w) => w.args.messageID === initiatedValidatorRemoval.args.validatorWeightMessageID)!;

    const validationID = event.args.validationID;
    const nodeID = encodeNodeID(event.args.nodeId); // Convert bytes32 to NodeID format by removing the first 12 bytes
    logger.log(nodeID)

    let addNodeBlockNumber = event.blockNumber;

    if (addNodeTxHash && addNodeTxHash.length > eventIndex) {
      const receipt = await client.waitForTransactionReceipt({ hash: addNodeTxHash[eventIndex], confirmations: 0 });
      if (receipt.status === 'reverted') throw new Error(`Transaction ${addNodeTxHash[eventIndex]} reverted, pls use another addNode tx`);
      const addNodeLogs = parseEventLogs({
        abi: config.abis.L1Middleware,
        logs: receipt.logs,
      })
      if (!addNodeLogs.some((w) => w.eventName === 'NodeAdded')) {
        logger.error(color.red("No matching NodeAdded event found for the provided NodeIDs, verify the addNode tx hash."));
        process.exit(1);
      }
      addNodeBlockNumber = receipt.blockNumber;
    }

    // Check if the node is still registered as a validator on the P-Chain
    const isValidator = currentValidators.some((v) => v.nodeID === nodeID);
    if (!isValidator) {
      logger.log(color.yellow("Node is not registered as a validator on the P-Chain."));
    } else {
      // Get the unsigned L1ValidatorWeightMessage with weight=0 generated by the ValidatorManager from the receipt
      const unsignedL1ValidatorWeightMessage = warpLog.args.message;

      // Aggregate signatures from validators
      const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
      logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

      // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
      pipe(
        await setValidatorWeight({
          client: pchainClient,
          validationID: validationID,
          message: signedL1ValidatorWeightMessage
        }),
        R.tapError(
          (error) => {
            throw new Error("SetL1ValidatorWeightTx failed on P-Chain: " + error + '\n');
          }),
        R.tap((txId) => {
          logger.log("SetL1ValidatorWeightTx executed on P-Chain: " + txId);
        })
      );

    }


    // Get SubnetID in Hex from the BalancerValidatorManager
    const subnetIDHex = await balancerValidatorManager.read.subnetID();
    // Convert SubnetID to cb58
    const subnetIDC58 = utils.base58check.encode(hexToBytes(subnetIDHex));

    // get justification for original register validator tx (the unsigned warp msg emitted)
    const justification = await GetRegistrationJustification(nodeID, validationID, subnetIDC58, client, addNodeBlockNumber);
    if (!justification) {
      throw new Error("Justification not found for validator removal");
    }

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    // logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex, bytesToHex(justification as Uint8Array));
    logger.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Execute completeEndValidation transaction
    logger.log("Executing completeEndValidation transaction...");
    // TODO: Find a way to use the proper signature of the method
    const method = securityModule.safeWrite.completeValidatorRemoval as any;
    const completeHash = await method([0],
      {
        account: client.account!,
        chain: null,
        accessList
      });

    if (waitValidatorVisible) {// Wait only for the last validator is enough
      logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
      await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
    }

    logger.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
  }
}

export async function completeWeightUpdate(
  client: ExtendedWalletClient,
  pchainClient: ExtendedWalletClient,
  securityModule: SafeSuzakuContract['PoASecurityModule'] | SafeSuzakuContract['L1Middleware'],
  config: Config,
  validatorWeightUpdateTxHash: Hex,
  nodeIDs?: NodeId[]
) {
  logger.log("Completing node stake update...");

  // Wait for the removeNode transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage and validationID from the receipt
  const receipt = await client.waitForTransactionReceipt({ hash: validatorWeightUpdateTxHash })

  // Convert nodeIDs to validationIDs
  let validationIds;
  if (nodeIDs) {
    const balancerAddress = await securityModule.read.balancerValidatorManager();
    const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
    validationIds = (await client.multicall({
      contracts: nodeIDs.map((id) => {
        return {
          ...balancer,
          functionName: 'getNodeValidationID',
          args: [parseNodeID(id)]
        }
      })
    })).reduce((acc, res) => {
      if (res.result) {
        acc.push(res.result as Hex)
      } else {
        logger.warn(color.yellow(`Warning: No validation ID found for NodeID ${nodeIDs[acc.length]}`))
      };
      return acc;
    }, [] as Hex[]);
  } else validationIds = undefined;

  const InitiatedValidatorWeightUpdates = parseEventLogs({
    abi: config.abis.BalancerValidatorManager,
    logs: receipt.logs,
    eventName: 'InitiatedValidatorWeightUpdate'
  }).filter((e) => validationIds ? validationIds.includes(e.args.validationID) : true)

  if (InitiatedValidatorWeightUpdates.length === 0) {
    logger.error(color.red("No matching NodeStakeUpdated event found for the provided NodeIDs. Verify the transaction hash and NodeIDs."));
    process.exit(1);
  }

  const warpLogs = parseEventLogs({
    abi: config.abis.IWarpMessenger,
    logs: receipt.logs,
  })

  for (const event of InitiatedValidatorWeightUpdates) {
    const InitiatedValidatorWeightUpdate = InitiatedValidatorWeightUpdates.find((e) => e.args.validationID === event.args.validationID)!;
    const warpLog = warpLogs.find((w) => w.args.messageID === InitiatedValidatorWeightUpdate.args.weightUpdateMessageID)!;

    const weight = InitiatedValidatorWeightUpdate.args.weight;
    const nonce = InitiatedValidatorWeightUpdate.args.nonce;
    const validationIDHex = InitiatedValidatorWeightUpdate.args.validationID
    const unsignedL1ValidatorWeightMessage = warpLog.args.message
    // Aggregate signatures from validators
    // logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
    const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

    // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
    pipe(await setValidatorWeight({
      client: pchainClient,
      validationID: validationIDHex,
      message: signedL1ValidatorWeightMessage
    }),
      R.tap(pChainSetWeightTxId => logger.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId)),
      R.tapError(err => {
        if (!err.includes('warp message contains stale nonce')) {
          logger.error(err);
          process.exit(1)
        }
        logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationIDHex} due to stale nonce (already issued)`));
      }));

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    // logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex);
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
    // TODO: Find a way to use the proper signature of the method
    const method = securityModule.safeWrite.completeValidatorWeightUpdate as any;
    const hash = await method([0]);
    logger.log("completeStakeUpdate done, tx hash:", hash);
  }
}

