import { Option } from "@commander-js/extra-typings";
import { ArgHex, ArgNodeID, ParserPrivateKey, ParserNumber, collectMultiple, ParserAddress, ArgAddress, ArgBLSPOP, ParserNodeID } from "./lib/cliParser";
import { logger } from "./lib/logger";
import { ArgBigInt, ParseUnits } from "./lib/cliParser";
import { completeValidatorRegistration, completeValidatorRemoval, completeWeightUpdate, getBalancerValidatorManager, getPoASecurityModule, initiateValidatorRemoval, NodeId, parseNodeID } from "@suzaku-network/suzaku-sdk/core";
import { fromBytes, Hex } from 'viem';
import { SuzakuCliProgram } from "./cli";
import { utils } from "@avalanche-sdk/client/utils";
import { requirePChainBallance } from "@suzaku-network/suzaku-sdk/node";
import { generateClient } from "./client";
import { argMiddlewareAddress } from "./middleware";

export const argPoaSecurityModuleAddress = ArgAddress("poaSecurityModuleAddress", "POA Security Module contract address");

/**
 * --------------------------------------------------
 * POA-Security-Module
 * --------------------------------------------------
 * This section is for the POA Security Module commands.
 * It includes commands to add or remove validators
 */
export function addPOACommands(program: SuzakuCliProgram) {
  const poaCmd = program
    .command("poa")
    .description("Commands to interact with POA Security Module contracts");

  poaCmd
    .command("add-node")
    .description("Add a new node to an L1")
    .addArgument(argPoaSecurityModuleAddress)
    .addArgument(ArgNodeID())
    .addArgument(ArgHex("blsKey", "BLS public key"))
    .addArgument(ArgBigInt("initialWeight", "Initial weight of the validator"))
    .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
    .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .asyncAction({ signer: true }, async (client, poaSecurityModule, nodeId, blsKey, initialWeight, options) => {
      const poaSM = await getPoASecurityModule(client, poaSecurityModule);
      const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

      // Default registration expiry to now + 12 hours if not provided
      // const registrationExpiry = options.registrationExpiry
      //     ? BigInt(options.registrationExpiry)
      //     : BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60); // current time + 12 hours in seconds

      // Build remainingBalanceOwner and disableOwner PChainOwner structs
      // If pchainRemainingBalanceOwnerAddress or pchainDisableOwnerAddress are empty (not provided), use the client account
      const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
      const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
      const remainingBalanceOwner: [number, Hex[]] = [
        Number(options.pchainRemainingBalanceOwnerThreshold),
        remainingBalanceOwnerAddress
      ];
      const disableOwner: [number, Hex[]] = [
        Number(options.pchainDisableOwnerThreshold),
        disableOwnerAddress
      ];

      const nodeIdHex32 = parseNodeID(nodeId, false)
      const hash = await poaSM.safeWrite.initiateValidatorRegistration([nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialWeight]);
      logger.log("addNode executed successfully, tx hash:", hash);
    });

  poaCmd
    .command("complete-validator-registration")
    .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
    .addArgument(argPoaSecurityModuleAddress)
    .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
    .addArgument(ArgBLSPOP())
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .asyncAction({ signer: true }, async (client, poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession, options) => {
      const opts = program.opts();

      // If pchainTxPrivateKey is not provided, use the private key
      if (!options.pchainTxPrivateKey) {
        options.pchainTxPrivateKey = opts.privateKey!;
      }


      const poaSecurityModule = await getPoASecurityModule(client, poaSecurityModuleAddress);
      const balancerSvc = await getBalancerValidatorManager(client, await poaSecurityModule.read.balancerValidatorManager());

      const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance')

      // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.000050000 AVAX (perhaps when the validator was removed recently)
      await requirePChainBallance(client, BigInt(Math.round((50000 + Number(initialBalance)))), opts.yes);

      // Call middlewareCompleteValidatorRegistration
      await completeValidatorRegistration(
        options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
        poaSecurityModule,
        balancerSvc,
        client,
        blsProofOfPossession,
        addNodeTxHash,
        initialBalance,
        !options.skipWaitApi
      );
    });

  poaCmd
    .command("remove-node")
    .description("Initiate validator removal")
    .addArgument(argPoaSecurityModuleAddress)
    .addArgument(ArgNodeID())
    .asyncAction({ signer: true }, async (client, poaSecurityModuleAddress, nodeID) => {
      const poaSecurityModule = await getPoASecurityModule(client, poaSecurityModuleAddress);
      const txHash = await initiateValidatorRemoval(client, poaSecurityModule, nodeID);
      logger.log(`End validation initialized for node ${nodeID}. Transaction hash: ${txHash}`);
    });

  poaCmd
    .command("complete-validator-removal")
    .description("Complete validator removal in the P-Chain and in the POA Security Module")
    .addArgument(argPoaSecurityModuleAddress)
    .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
    .asyncAction({ signer: true }, async (client, poaSecurityModuleAddress, removeNodeTxHash, options) => {
      const opts = program.opts();
      if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;

      const poaSecurityModule = await getPoASecurityModule(client, poaSecurityModuleAddress);
      const balancerSvc = await getBalancerValidatorManager(client, await poaSecurityModule.read.balancerValidatorManager());
      // Check if P-Chain address have 0.000050000 AVAX for tx fees
      await requirePChainBallance(client, 50000n, opts.yes);

      const txHash = await completeValidatorRemoval(
        options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
        poaSecurityModule,
        balancerSvc,
        client,
        removeNodeTxHash,
        !options.skipWaitApi,
        options.nodeId.length > 0 ? options.nodeId : undefined,
      );

      logger.log(`End validation initialized for node . Transaction hash: ${txHash}`);
    });

  poaCmd
    .command("init-weight-update")
    .description("Update validator weight")
    .addArgument(argPoaSecurityModuleAddress)
    .addArgument(ArgNodeID())
    .addArgument(ArgBigInt("newWeight", "New weight"))
    .asyncAction({ signer: true }, async (client, poaSecurityModuleAddress, nodeId, newWeight) => {
      const poaSecurityModule = await getPoASecurityModule(client, poaSecurityModuleAddress);
      logger.log("Calling function initializeValidatorStakeUpdate...");

      // Parse NodeID to bytes32 format
      const nodeIdHex32 = parseNodeID(nodeId)

      const hash = await poaSecurityModule.safeWrite.initiateValidatorWeightUpdate([nodeIdHex32, newWeight]);
      logger.log("initiateValidatorWeightUpdate executed successfully, tx hash:", hash);
    });

  poaCmd
    .command("complete-weight-update")
    .description("Complete validator weight update of all or specified node IDs")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
    .asyncAction({ signer: true }, async (client, poaSecurityModuleAddress, weightUpdateTxHash, options) => {
      const opts = program.opts();
      if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;

      const poaSecurityModule = await getPoASecurityModule(client, poaSecurityModuleAddress);
      // Check if P-Chain address have 0.000050000 AVAX for tx fees
      await requirePChainBallance(client, 50000n, opts.yes);

      const txHash = await completeWeightUpdate(
        options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
        poaSecurityModule,
        client,
        weightUpdateTxHash,
        options.nodeId.length > 0 ? options.nodeId : undefined,
      );

      logger.log(`Weight update completed for node . Transaction hash: ${txHash}`);
    });
  return poaCmd;
}
