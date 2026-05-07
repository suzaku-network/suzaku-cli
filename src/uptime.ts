import { packValidationUptimeMessage, collectSignatures, packWarpIntoAccessList } from "./lib/warpUtils";
import { bytesToHex } from '@noble/hashes/utils';
import { hexToBytes, Hex } from 'viem';
import { SafeSuzakuContract } from './lib/viemUtils';
import { ExtendedClient } from "./client";
import { logger } from './lib/logger';
import { validatedBy } from "./lib/pChainUtils";
import { cb58ToHex } from "./lib/utils";
import { ArgAddress, ArgCB58, ArgHex, ArgNodeID, ArgNumber, ArgURI, ParserNumber } from "./lib/cliParser";
import { SuzakuCliProgram } from "./cli";
import { argMiddlewareAddress } from "./middleware";
import { getL1Middleware, getUptimeTracker } from "@suzaku-sdk/core";
import { argOperatorAddress } from "./operator";
import { Option } from "@commander-js/extra-typings";

export const argUptimeTrackerAddress = ArgAddress("uptimeTrackerAddress", "UptimeTracker contract address");

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
  if (data.error) throw logger.formatError(["Error from validators.getCurrentValidators:", data.error], 3)
  return data.result.validators;
}

export async function getValidationUptimeMessage(
  client: ExtendedClient,
  rpcUrl: string,
  nodeId: string,
  networkID: number,
  sourceChainID: string
) {
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

async function computeValidatorUptime(
  uptimeTracker: SafeSuzakuContract['UptimeTracker'],
  signedUptimeHex: Hex
) {
  const warpBytes = hexToBytes(signedUptimeHex);
  const accessList = packWarpIntoAccessList(warpBytes);
  const txHash = await uptimeTracker.safeWrite.computeValidatorUptime([0], { accessList });
  logger.log("computeValidatorUptime done, tx hash:", txHash);
  return txHash;
}

export function addUptimeCommands(program: SuzakuCliProgram) {
  const uptimeCmd = program
    .command("uptime")
    .description("Commands related to validator uptime reporting");

  uptimeCmd
    .command("get-validation-uptime-message")
    .description("Get the validation uptime message for a given validator in the given L1 RPC")
    .addArgument(ArgURI("rpcUrl", "RPC URL like 'http(s)://<domain or ip and port>'"))
    .addArgument(ArgCB58("blockchainId", "Blockchain ID"))
    .addArgument(ArgNodeID())
    .asyncAction(async (client, rpcUrl, blockchainId, nodeId) => {
      rpcUrl = rpcUrl + "/ext/bc/" + blockchainId;
      await getValidationUptimeMessage(
        client,
        rpcUrl,
        nodeId,
        client.network === "fuji" ? 5 : 1,
        blockchainId);
    });

  uptimeCmd
    .command('compute-validator-uptime')
    .addArgument(argUptimeTrackerAddress)
    .addArgument(ArgHex("signedUptimeHex", "Signed uptime hex"))
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, signedUptimeHex) => {
      await computeValidatorUptime(
        await getUptimeTracker(client, uptimeTrackerAddress),
        signedUptimeHex
      );
    });

  uptimeCmd
    .command("report-uptime-validator")
    .description("Gets a validator's signed uptime message and submits it to the UptimeTracker contract.")
    .addArgument(ArgURI("rpcUrl", "RPC URL like 'http(s)://<domain or ip and port>'"))
    .addArgument(ArgCB58("blockchainId", "The Blockchain ID for which the uptime is being reported"))
    .addArgument(ArgNodeID("nodeId", "The NodeID of the validator"))
    .addArgument(argUptimeTrackerAddress)
    .asyncAction({ signer: true }, async (client, rpcUrl, blockchainId, nodeId, uptimeTrackerAddress) => {
      const opts = program.opts();
      if (!opts.privateKey!) {
        logger.error("Error: Private key is required. Use -k or set PK environment variable.");
        process.exit(1);
      }

      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      logger.log(`Starting validator uptime report for NodeID: ${nodeId} on source chain ${blockchainId} via RPC ${rpcUrl}`);
      logger.log(`Target UptimeTracker: ${uptimeTracker.address}`);

      const warpNetworkID = client.network === 'mainnet' ? 1 : 5;
      let signedUptimeHex = await getValidationUptimeMessage(client, rpcUrl, nodeId, warpNetworkID, blockchainId);

      logger.log(`Raw Signed Uptime Message from getValidationUptimeMessage: ${signedUptimeHex}`);

      if (typeof signedUptimeHex === 'string') {
        if (!signedUptimeHex.startsWith('0x')) {
          signedUptimeHex = `0x${signedUptimeHex}`;
        }
      } else {
        logger.error("getValidationUptimeMessage did not return a string for the signed message.");
        throw new Error("Failed to obtain a valid signed uptime hex message (not a string).");
      }

      if (!signedUptimeHex || typeof signedUptimeHex !== 'string' || !signedUptimeHex.startsWith('0x') || signedUptimeHex.length <= 2) {
        logger.error(`Problematic signedUptimeHex after normalization: '${signedUptimeHex}'`);
        throw new Error("Failed to obtain a valid signed uptime hex message (post-normalization check failed).");
      }

      logger.log(`\nStep 1 complete. Normalized Signed Uptime Hex: ${signedUptimeHex}`);
      logger.log("\nStep 2: Submitting uptime to the UptimeTracker contract...");
      const txHash = await computeValidatorUptime(uptimeTracker, signedUptimeHex as Hex);
      logger.log("\nValidator uptime report and submission complete.");
      logger.log("Final Transaction Hash:", txHash);
    });

  uptimeCmd
    .command("compute-operator-uptime")
    .description("Compute uptime for an operator at a specific epoch")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, operator, epoch) => {
      const opts = program.opts();
      if (!opts.privateKey!) {
        logger.error("Error: Private key is required. Use -k or set PK environment variable.");
        process.exit(1);
      }
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const txHash = await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);
      logger.log(`computeOperatorUptimeAt for epoch ${epoch} done, tx hash: ${txHash}`);
    });

  uptimeCmd
    .command("compute-operator-uptime-range")
    .description("Compute uptime for an operator over a range of epochs (client-side looping)")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("startEpoch", "Starting epoch number"))
    .addArgument(ArgNumber("endEpoch", "Ending epoch number"))
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, operator, startEpoch, endEpoch) => {
      const opts = program.opts();
      if (!opts.privateKey!) {
        logger.error("Error: Private key is required. Use -k or set PK environment variable.");
        process.exit(1);
      }
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
        await uptimeTracker.safeWrite.computeOperatorUptimeAt([operator, epoch]);
      }
    });

  uptimeCmd
    .command("get-validator-uptime")
    .description("Get the recorded uptime for a validator at a specific epoch")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(ArgHex("validationID", "Validation ID of the validator"))
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, uptimeTrackerAddress, validationID, epoch) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const uptime = await uptimeTracker.read.validatorUptimePerEpoch([epoch, validationID]);
      logger.log(`Validator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
    });

  uptimeCmd
    .command("check-validator-uptime-set")
    .description("Check if uptime data is set for a validator at a specific epoch")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(ArgHex("validationID", "Validation ID of the validator"))
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, uptimeTrackerAddress, validationID, epoch) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const isSet = await uptimeTracker.read.isValidatorUptimeSet([epoch, validationID]);
      logger.log(`Validator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
    });

  uptimeCmd
    .command("get-operator-uptime")
    .description("Get the recorded uptime for an operator at a specific epoch")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, uptimeTrackerAddress, operator, epoch) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const uptime = await uptimeTracker.read.operatorUptimePerEpoch([epoch, operator]);
      logger.log(`Operator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
    });

  uptimeCmd
    .command("check-operator-uptime-set")
    .description("Check if uptime data is set for an operator at a specific epoch")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, uptimeTrackerAddress, operator, epoch) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const isSet = await uptimeTracker.read.isOperatorUptimeSet([epoch, operator]);
      logger.log(`Operator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
    });

  uptimeCmd
    .command("uptime-sync")
    .description("Report uptime for all validators")
    .addArgument(argUptimeTrackerAddress)
    .addArgument(argMiddlewareAddress)
    .argument("rpcUrl", "RPC URL of the network")
    .addArgument(ArgCB58("blockchainId", "The Blockchain ID for which the uptime is being reported"))
    .addOption(new Option("--epoch <epoch>", "Epoch number to check (defaults to current epoch)").argParser(ParserNumber))
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, middlewareAddress, rpcUrl, blockchainId, options) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const middleware = await getL1Middleware(client, middlewareAddress);
      const sourceChainID = blockchainId;

      const targetEpoch = Number(await middleware.read.getCurrentEpoch());
      logger.log(`Checking uptime status for epoch ${targetEpoch}...`);

      const operators = await middleware.read.getAllOperators();
      if (operators.length === 0) {
        logger.log("No operators found.");
        return;
      }

      let currentValidators = await getCurrentValidatorsFromNode(rpcUrl);
      if (currentValidators.length === 0) {
        logger.log("No validators found for any operator.");
        return;
      }

      const allValidationIDs = (await middleware.multicall(operators.map(op => ({ name: "getOperatorValidationIDs", args: [op] })))).flat();
      currentValidators = currentValidators.filter(v => allValidationIDs.includes(cb58ToHex(v.validationID)));

      const uptimeStatus = await uptimeTracker.multicall(
        currentValidators.map(v => ({ name: 'isValidatorUptimeSet', args: [targetEpoch, cb58ToHex(v.validationID)] }))
      )

      const signingSubnetId = await validatedBy(client, sourceChainID);
      const networkID = client.network === 'mainnet' ? 1 : 5;

      for (const [index, validator] of currentValidators.entries()) {
        const { validationID, nodeID, uptimeSeconds } = validator;
        const status = uptimeStatus[index];

        if (!status) {
          logger.log(`Reporting uptime for validator ${validationID} (${nodeID})...`);
          const unsignedValidationUptimeMessage = packValidationUptimeMessage(validationID, uptimeSeconds, networkID, sourceChainID);
          const unsignedValidationUptimeMessageHex = bytesToHex(unsignedValidationUptimeMessage);
          let signedUptimeHex = await collectSignatures({ network: client.network, message: unsignedValidationUptimeMessageHex, signingSubnetId });

          if (typeof signedUptimeHex === 'string') {
            if (!signedUptimeHex.startsWith('0x')) {
              signedUptimeHex = `0x${signedUptimeHex}`;
            }
          } else {
            logger.error("getValidationUptimeMessage did not return a string for the signed message.");
            throw new Error("Failed to obtain a valid signed uptime hex message (not a string).");
          }

          if (!signedUptimeHex || typeof signedUptimeHex !== 'string' || !signedUptimeHex.startsWith('0x') || signedUptimeHex.length <= 2) {
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

      const epochsToCheck = targetEpoch < 50 ? targetEpoch : 50;
      const epochRange = Array.from({ length: epochsToCheck }, (_, i) => targetEpoch - i - 1);
      let operatorUptimeStatus = await uptimeTracker.multicall(
        operators.flatMap(op => epochRange.map(epoch => ({ name: 'isOperatorUptimeSet', args: [epoch, op] })))
      );

      const operatorHadValidator = await middleware.multicall(operators.flatMap(op => epochRange.map(epoch => ({ name: 'getActiveNodesForEpoch', args: [op, epoch] }))));
      operatorUptimeStatus = operatorUptimeStatus.map((activeNodes, index) => operatorHadValidator[index].length > 0 ? activeNodes : true);

      for (const [index, operator] of operators.entries()) {
        const operatorEpochStatus = operatorUptimeStatus.slice(index * epochsToCheck, (index + 1) * epochsToCheck);
        const operatorEpochsWithoutUptime = epochRange.filter((_, i) => !operatorEpochStatus[i]);
        if (operatorEpochsWithoutUptime.length > 0) {
          logger.log(`Operator ${operator} has missing uptime reports`);
          logger.addData("missingOperatorUptime", { operator, epochs: operatorEpochsWithoutUptime });
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
    });
  return uptimeCmd;
}
