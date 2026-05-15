import { type Hex } from 'viem';
import { logger } from './lib/logger';
import { ArgAddress, ArgCB58, ArgHex, ArgNodeID, ArgNumber, ArgURI, ParserNumber } from "./lib/cliParser";
import { SuzakuCliProgram } from "./cli";
import { argMiddlewareAddress } from "./middleware";
import { getL1Middleware, getUptimeTracker, getCurrentValidatorsFromNode, getValidationUptimeMessage, computeValidatorUptime, syncUptime } from "@suzaku-sdk/core";
import { argOperatorAddress } from "./operator";
import { Option } from "@commander-js/extra-typings";

export const argUptimeTrackerAddress = ArgAddress("uptimeTrackerAddress", "UptimeTracker contract address");

export { getCurrentValidatorsFromNode, getValidationUptimeMessage };

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
      const bypassToken = process.env.RPC_BYPASS_TOKEN;
      await getValidationUptimeMessage(
        client,
        rpcUrl,
        nodeId,
        client.network === "fuji" ? 5 : 1,
        blockchainId,
        bypassToken,
      );
    });

  uptimeCmd
    .command('compute-validator-uptime')
    .addArgument(argUptimeTrackerAddress)
    .addArgument(ArgHex("signedUptimeHex", "Signed uptime hex"))
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, signedUptimeHex) => {
      await computeValidatorUptime(
        await getUptimeTracker(client, uptimeTrackerAddress),
        signedUptimeHex,
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
      const bypassToken = process.env.RPC_BYPASS_TOKEN;
      let signedUptimeHex = await getValidationUptimeMessage(client, rpcUrl, nodeId, warpNetworkID, blockchainId, bypassToken);

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
    .asyncAction({ signer: true }, async (client, uptimeTrackerAddress, middlewareAddress, rpcUrl, blockchainId) => {
      const uptimeTracker = await getUptimeTracker(client, uptimeTrackerAddress);
      const middleware = await getL1Middleware(client, middlewareAddress);
      const bypassToken = process.env.RPC_BYPASS_TOKEN;
      await syncUptime(client, uptimeTracker, middleware, rpcUrl, blockchainId, bypassToken);
    });

  return uptimeCmd;
}
