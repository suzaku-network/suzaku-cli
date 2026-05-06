import { bytesToHex, Hex, hexToBytes, parseEventLogs } from "viem";
import { ExtendedWalletClient } from "../client/types";
import { Config } from "../config";
import { SafeEnhancedContract } from "../client/viemUtils";
import { getBalancerValidatorManager } from "../BalancerValidatorManager/abi";
import { encodeNodeID, NodeId, parseNodeID, retryWhileError } from "../lib/avalancheUtils";
import { logger } from '../logger';
import { color } from "console-log-colors";
import { collectSignatures, decodeWarpMessages, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList, WarpMessageType } from "../lib/warpUtils";
import { getCurrentValidators, registerL1Validator, setValidatorWeight, validatedBy } from "../lib/pChainUtils";
import { getSigningSubnetIdFromWarpMessage } from "../lib/pChainUtils";
import { pipe, R } from "@mobily/ts-belt";
import { GetRegistrationJustification } from "../lib/justification";
import { utils } from "@avalabs/avalanchejs";
import { blockAtTimestamp } from "../lib/cChainUtils";
import { ValidatorStatus } from "../BalancerValidatorManager/types";
import { pChainChainID } from "../lib/avalancheUtils";
import PoASecurityModuleAbi from "../PoASecurityModule/abi";
import L1MiddlewareAbi from "../L1Middleware/abi";
import BalancerValidatorManagerAbi from "../BalancerValidatorManager/abi";
import IWarpMessengerAbi from "../IWarpMessenger/abi";

type SecurityModuleContract =
  SafeEnhancedContract<typeof PoASecurityModuleAbi, ExtendedWalletClient> |
  SafeEnhancedContract<typeof L1MiddlewareAbi, ExtendedWalletClient>;
type BalancerContract = SafeEnhancedContract<typeof BalancerValidatorManagerAbi, ExtendedWalletClient>;

export async function completeValidatorRegistration<T extends ExtendedWalletClient>(
  pchainClient: T,
  securityModule: SecurityModuleContract,
  balancer: BalancerContract,
  config: Config<T>,
  blsProofOfPossession: string,
  addNodeTxHash: Hex,
  initialBalance: bigint,
  waitValidatorVisible: boolean
) {
  logger.log("Completing validator registration...");
  const client = config.client;
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

  const validator = await balancer.read.getValidator([InitiatedValidatorRegistration.args.validationID])
  if (validator.status === ValidatorStatus.Active) {
    logger.log(color.yellow("Node is already registered as a validator on the balancer, skipping registerL1Validator call."));
    return;
  }
  const warpLogs = parseEventLogs({
    abi: IWarpMessengerAbi,
    logs: receipt.logs,
  })[0]
  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs.args.message);

  const nodeId = encodeNodeID(InitiatedValidatorRegistration.args.nodeID);
  const subnetIDHex = await balancer.read.subnetID();
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  const isValidator = (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeId);
  if (isValidator) {
    logger.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
  } else {
    const RegisterL1ValidatorUnsignedWarpMsg = warpLogs.args.message;

    logger.log("\nCollecting signatures for the L1ValidatorRegistrationMessage from the Validator Manager chain...");
    const signedMessage = await collectSignatures({ network: client.network, message: RegisterL1ValidatorUnsignedWarpMsg, signingSubnetId });

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

  const validationIDHex = InitiatedValidatorRegistration.args.validationID;
  const validationIDBytes = hexToBytes(validationIDHex as Hex);
  const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, client.network === 'fuji' ? 5 : 1, pChainChainID);
  const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

  logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
  const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });

  const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
  const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

  logger.log("\nCalling function completeValidatorRegistration...");
  // TODO: Find a way to use the proper signature of the method
  const method = securityModule.safeWrite.completeValidatorRegistration as any;
  const hash = await method([0],
    {
      account: client.account!,
      chain: null,
      accessList
    });

  if (waitValidatorVisible) {
    logger.log("Waiting for the validator to be visible on the P-Chain (may take a while)...");
    await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeId), 5000, 180000, (res) => res === true);
  }

  logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
}

export async function completeValidatorRemoval<T extends ExtendedWalletClient>(
  pchainClient: T,
  securityModule: SecurityModuleContract,
  balancerValidatorManager: BalancerContract,
  config: Config<T>,
  initializeEndValidationTxHash: Hex,
  waitValidatorVisible: boolean,
  nodeIDs?: NodeId[],
) {
  logger.log("Completing validator removal...");
  const client = config.client;
  const receipt = await client.waitForTransactionReceipt({ hash: initializeEndValidationTxHash, confirmations: 1 });
  if (receipt.status === 'reverted') throw new Error(`Transaction ${initializeEndValidationTxHash} reverted, pls resend the removeNode transaction`);

  const warpLogs = parseEventLogs({
    abi: IWarpMessengerAbi,
    logs: receipt.logs,
  })

  let messages = decodeWarpMessages(warpLogs.map((l) => l.args.message), WarpMessageType.L1ValidatorWeightMessage)
    .filter((m) => m.weight === 0)

  if (messages.length === 0) throw new Error("No messages found in the receipt.");

  let validators = await balancerValidatorManager.multicall(messages.map((m) => ({ name: "getValidator" as const, args: [m.validationID] as const })))

  validators = validators
    .filter((v) => {
      if (v.status !== ValidatorStatus.PendingRemoved) logger.log(color.yellow(`Node ${encodeNodeID(v.nodeID)} (status: ${ValidatorStatus[v.status]}) is not pending removed, skipping. `))
      return v.status === ValidatorStatus.PendingRemoved
    });

  if (validators.length === 0) throw new Error("No validators found in the receipt.");

  if (nodeIDs) {
    messages = messages.filter((m) => nodeIDs.includes(encodeNodeID(validators[messages.indexOf(m)].nodeID)));
    if (messages.length === 0) throw new Error("No messages found in the receipt.");
    validators = validators.filter((v) => nodeIDs.includes(encodeNodeID(v.nodeID)));
  }

  const subnetIDHex = await balancerValidatorManager.read.subnetID();
  const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
  const currentValidators = (await getCurrentValidators(client, subnetID))
  const signingSubnetId = await validatedBy(client, messages[0].sourceChainID)
  let completeHash: Hex = "0x0";
  for (const [messageIndex, message] of messages.entries()) {

    const validationID = message.validationID;
    const nodeID = encodeNodeID(validators[messageIndex].nodeID);
    logger.log(nodeID)

    const isValidator = currentValidators.some((v) => v.nodeID === nodeID);
    if (!isValidator) {
      logger.log(color.yellow("Node is not registered as a validator on the P-Chain."));
    } else {
      const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: message.raw, signingSubnetId });
      logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

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

    const subnetIDHex = await balancerValidatorManager.read.subnetID();
    const subnetIDC58 = utils.base58check.encode(hexToBytes(subnetIDHex));

    const justification = await GetRegistrationJustification(nodeID, validationID, subnetIDC58, client, await blockAtTimestamp(client, validators[messageIndex].startTime));
    if (!justification) {
      throw new Error("Justification not found for validator removal");
    }

    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification as Uint8Array), signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    logger.log("Executing completeEndValidation transaction...");
    // TODO: Find a way to use the proper signature of the method
    const method = securityModule.safeWrite.completeValidatorRemoval as any;
    completeHash = await method([0],
      {
        account: client.account!,
        chain: null,
        accessList
      });

    if (waitValidatorVisible) {
      logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
      await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
    }

    logger.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
  }
  return { nodes: validators.map((n) => encodeNodeID(n.nodeID)), txHash: completeHash };
}

export async function completeWeightUpdate<T extends ExtendedWalletClient>(
  pchainClient: T,
  securityModule: SecurityModuleContract,
  config: Config<T>,
  validatorWeightUpdateTxHash: Hex,
  nodeIDs?: NodeId[]
) {
  logger.log("Completing node stake update...");
  const client = config.client;
  const receipt = await client.waitForTransactionReceipt({ hash: validatorWeightUpdateTxHash })

  const balancerAddress = await securityModule.read.balancerValidatorManager();
  const balancer = await getBalancerValidatorManager(config, balancerAddress);
  let validationIds;
  if (nodeIDs) {
    validationIds = (await client.multicall({
      contracts: nodeIDs.map((id) => {
        return {
          address: balancer.address,
          abi: balancer.abi,
          functionName: 'getNodeValidationID',
          args: [parseNodeID(id)]
        }
      })
    })).reduce((acc: Hex[], res: any) => {
      if (res.result) {
        acc.push(res.result as Hex)
      } else {
        logger.warn(color.yellow(`Warning: No validation ID found for NodeID ${nodeIDs[acc.length]}`))
      };
      return acc;
    }, [] as Hex[]);
  } else validationIds = undefined;

  const InitiatedValidatorWeightUpdates = parseEventLogs({
    abi: BalancerValidatorManagerAbi,
    logs: receipt.logs,
    eventName: 'InitiatedValidatorWeightUpdate'
  }).filter((e) => validationIds ? validationIds.includes(e.args.validationID) : true)

  if (InitiatedValidatorWeightUpdates.length === 0) {
    logger.error(color.red("No matching NodeStakeUpdated event found for the provided NodeIDs. Verify the transaction hash and NodeIDs."));
    process.exit(1);
  }

  const warpLogs = parseEventLogs({
    abi: IWarpMessengerAbi,
    logs: receipt.logs,
  })
  const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs[0].args.message);
  for (const event of InitiatedValidatorWeightUpdates) {
    const InitiatedValidatorWeightUpdate = InitiatedValidatorWeightUpdates.find((e) => e.args.validationID === event.args.validationID)!;
    const warpLog = warpLogs.find((w) => w.args.messageID === InitiatedValidatorWeightUpdate.args.weightUpdateMessageID)!;

    const weight = InitiatedValidatorWeightUpdate.args.weight;
    const nonce = InitiatedValidatorWeightUpdate.args.nonce;
    const validationIDHex = InitiatedValidatorWeightUpdate.args.validationID
    const unsignedL1ValidatorWeightMessage = warpLog.args.message
    const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

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

    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
    // TODO: Find a way to use the proper signature of the method
    const method = securityModule.safeWrite.completeValidatorWeightUpdate as any;
    const hash = await method([0],
      { chain: client.chain, accessList }
    );
    logger.log("completeStakeUpdate done, tx hash:", hash);
  }
}
