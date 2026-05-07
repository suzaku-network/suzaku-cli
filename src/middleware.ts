import { Abi, bytesToHex, formatUnits, fromBytes, getAbiItem, Hex, hexToBytes, parseUnits } from 'viem';
import { SafeSuzakuContract } from './lib/viemUtils';
import { ExtendedClient, generateClient } from './client';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { encodeNodeID, NodeId, parseNodeID } from './lib/utils';
import { blockAtTimestamp, collectEventsInRange, DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { logger } from './lib/logger';
import { completeValidatorRemoval, Validator, ValidatorStatus, ValidatorStatusNames, L1MiddlewareABI, BalancerValidatorManagerABI, getBalancerValidatorManager, getL1Middleware, getDefaultCollateral, completeValidatorRegistration, completeWeightUpdate, getVaultTokenized, getAccessControl } from '@suzaku-sdk/core';
import { getCurrentValidators } from './lib/pChainUtils';
import { utils } from '@avalabs/avalanchejs';
import { ArgAddress, ArgBigInt, ArgBLSPOP, ArgHex, ArgNodeID, ArgNumber, collectMultiple, ParserAddress, ParserAVAX, ParserNodeID, ParserNumber, ParserPrivateKey, ParseUnits } from './lib/cliParser';
import { SuzakuCliProgram } from './cli';
import { Option } from '@commander-js/extra-typings';
import { increasePChainValidatorBalance, requirePChainBallance } from '@suzaku-sdk/node';
import { hexToUint8Array } from '@suzaku-sdk/core/lib/justification';
import { A, pipe, R } from '@mobily/ts-belt';
import { argVaultAddress } from './vault';
import { argMiddlewareVaultManagerAddress } from './vaultManager';
import { ensureRoleHex, getRoles } from './accessControl';
import { argOperatorAddress } from './operator';

export const argMiddlewareAddress = ArgAddress("middlewareAddress", "Middleware contract address");

export function groupEventsByNodeId(events: DecodedEvent[]): Record<string, { source: string; event: string; hash: string; executionTime: string }[]> {
  return events.reduce((acc, log) => {
    if (log.args.nodeId) {
      const key = log.args.nodeId;
      if (!acc[key]) acc[key] = [];
      const same = acc[key].some((l) => l.hash === log.transactionHash);
      const hash = same ? "↑same↑" : log.transactionHash;
      const executionTime = log.timestamp ? same ? "↑same↑" : new Date(Number(log.timestamp) * 1000).toLocaleString() : 'N/A';
      acc[key].push({
        source: log.address,
        event: log.eventName,
        executionTime,
        hash: hash,
      });
    }
    return acc;
  }, {} as Record<string, { source: string; event: string; hash: string; executionTime: string }[]>);
}

export interface OperatorForceUpdatePrediction {
  operator: Hex;
  willLoseWeight: boolean;
  currentTotalStake: bigint;
  cappedTotalStake: bigint;
  registeredStake: bigint;
  stakeDeficit: bigint;
  activeNodesCount: number;
}

export async function predictForceUpdateImpact(
  client: ExtendedClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  operators: Hex[]
): Promise<OperatorForceUpdatePrediction[]> {
  if (operators.length === 0) return [];

  const [
    currentEpoch,
    weightScaleFactor,
    balancerAddress,
    primaryAssetClass
  ] = await middleware.multicall([
    'getCurrentEpoch',
    'WEIGHT_SCALE_FACTOR',
    'BALANCER',
    'PRIMARY_ASSET_CLASS'
  ]);

  const balancer = await getBalancerValidatorManager(client, balancerAddress)
  const [, securityModuleMaxWeight] = await balancer.read.getSecurityModuleWeights([middleware.address])
  const maxStakeCap = BigInt(securityModuleMaxWeight) * weightScaleFactor;

  const results = await middleware.multicall(operators.flatMap(op => [
    { name: 'getOperatorStake', args: [op, currentEpoch, primaryAssetClass] },
    { name: 'getOperatorUsedStakeCached', args: [op] },
    { name: 'operatorLockedStake', args: [op] },
    { name: 'getActiveNodesForEpoch', args: [op, currentEpoch] }
  ]));

  const predictions: OperatorForceUpdatePrediction[] = [];

  for (let i = 0; i < operators.length; i++) {
    const baseIndex = i * 4;
    const operator = operators[i];
    const theoreticalStake = results[baseIndex] as bigint;
    const usedStake = results[baseIndex + 1] as bigint;
    const lockedStake = results[baseIndex + 2] as bigint;
    const activeNodes = results[baseIndex + 3] as readonly `0x${string}`[];

    let cappedStake = theoreticalStake;
    if (cappedStake > maxStakeCap) cappedStake = maxStakeCap;

    const registeredStake = usedStake + lockedStake;
    let stakeDeficit = 0n;
    let willLoseWeight = false;
    if (cappedStake < registeredStake) {
      stakeDeficit = registeredStake - cappedStake;
      if (stakeDeficit >= weightScaleFactor && activeNodes.length > 0) {
        willLoseWeight = true;
      }
    }

    predictions.push({
      operator,
      willLoseWeight,
      currentTotalStake: theoreticalStake,
      cappedTotalStake: cappedStake,
      registeredStake,
      stakeDeficit,
      activeNodesCount: activeNodes.length
    });
  }

  return predictions;
}

/* --------------------------------------------------
* MIDDLEWARE
* -------------------------------------------------- */
export function addMiddlewareCommands(program: SuzakuCliProgram) {
const middlewareCmd = program
    .command("middleware")
    .description("Commands to interact with the L1 Middleware contract");

middlewareCmd
    .command("add-collateral-class")
    .description("Add a new collateral class to the middleware")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .argument("minValidatorStake", "Minimum validator stake amount")
    .argument("maxValidatorStake", "Maximum validator stake amount")
    .addArgument(ArgAddress("initialCollateral", "Initial collateral address"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId, minValidatorStake, maxValidatorStake, initialCollateral) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const collateral = await getDefaultCollateral(client, initialCollateral);
        const decimals = await collateral.read.decimals();
        const minStakeWei = parseUnits(minValidatorStake, decimals);
        const maxStakeWei = parseUnits(maxValidatorStake, decimals);
        await middlewareSvc.safeWrite.addCollateralClass([collateralClassId, minStakeWei, maxStakeWei, initialCollateral],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Added collateral class ${collateralClassId} with min stake ${minValidatorStake} and max stake ${maxValidatorStake} using collateral at ${initialCollateral}`);
    });

middlewareCmd
    .command("add-collateral-to-class")
    .description("Add a new collateral address to an existing collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .addArgument(ArgAddress("collateralAddress", "Collateral address to add"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId, collateralAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await middlewareSvc.safeWrite.addAssetToClass([collateralClassId, collateralAddress],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Added collateral ${collateralAddress} to class ${collateralClassId}`);
    });

middlewareCmd
    .command("remove-collateral-from-class")
    .description("Remove a collateral address from an existing collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .addArgument(ArgAddress("collateralAddress", "Collateral address to remove"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId, collateralAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const tx = await middlewareSvc.safeWrite.removeAssetFromClass([collateralClassId, collateralAddress],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Removed collateral ${collateralAddress} from class ${collateralClassId}`);
        logger.log("tx hash:", tx);
    });

middlewareCmd
    .command("remove-collateral-class")
    .description("Remove an existing secondary collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await middlewareSvc.safeWrite.removeCollateralClass([collateralClassId],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Removed collateral class ${collateralClassId}`);
    });

middlewareCmd
    .command("activate-collateral-class")
    .description("Activate a secondary collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await middlewareSvc.safeWrite.activateSecondaryCollateralClass([collateralClassId],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Activated collateral class ${collateralClassId}`);
    });

middlewareCmd
    .command("deactivate-collateral-class")
    .description("Deactivate a secondary collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, collateralClassId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await middlewareSvc.safeWrite.deactivateSecondaryCollateralClass([collateralClassId],
            {
                chain: null,
                account: client.account!,
            });
        logger.log(`Deactivated collateral class ${collateralClassId}`);
    });

middlewareCmd
    .command("register-operator")
    .description("Register an operator to operate on this L1")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction({ signer: true }, async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Registering operator...");
        const hash = await middlewareSvc.safeWrite.registerOperator([operator]);
        logger.log("registerOperator done, tx hash:", hash);
    });

middlewareCmd
    .command("disable-operator")
    .description("Disable an operator to prevent it from operating on this L1")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction({ signer: true }, async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Disabling operator...");
        const hash = await middlewareSvc.safeWrite.disableOperator([operator]);
        logger.log("disableOperator done, tx hash:", hash);
    });

middlewareCmd
    .command("remove-operator")
    .description("Remove an operator from this L1")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction({ signer: true }, async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Removing operator...");
        const hash = await middlewareSvc.safeWrite.removeOperator([operator]);
        logger.log("removeOperator done, tx hash:", hash);
    });

middlewareCmd
    .command("process-node-stake-cache")
    .description("Manually process node stake cache for one or more epochs")
    .addArgument(argMiddlewareAddress)
    .addOption(new Option("--epochs <epochs>", "Number of epochs to process (default: all)").default(0).argParser(ParserNumber))
    .addOption(new Option("--loop-epochs <count>", "Loop through multiple epochs, processing --epochs at a time").argParser(ParserNumber))
    .addOption(new Option("--delay <milliseconds>", "Delay between loop iterations in milliseconds (default: 1000)").default(1000).argParser(ParserNumber))
    .asyncAction({ signer: true }, async (client, middlewareAddress, options) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);

        let epochsPerCall;
        let loopCount;
        if (options.epochs || options.loopEpochs) {
            epochsPerCall = options.epochs || 1;
            loopCount = options.loopEpochs || 1;
        } else {
            epochsPerCall = await middlewareSvc.read.getCurrentEpoch() - await middlewareSvc.read.lastGlobalNodeStakeUpdateEpoch();
            loopCount = epochsPerCall > 50 ? Math.ceil(epochsPerCall / 50) : 1;
            epochsPerCall = Math.ceil(epochsPerCall / loopCount);
        }

        logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);

        for (let i = 0; i < loopCount; i++) {
            logger.log(`\nIteration ${i + 1}/${loopCount}`);
            logger.log("Processing node stake cache...");
            const hash = await middlewareSvc.safeWrite.manualProcessNodeStakeCache([epochsPerCall]);
            logger.log("manualProcessNodeStakeCache done, tx hash:", hash);

            if (i < loopCount - 1 && options.delay > 0) {
                logger.log(`Waiting ${options.delay}ms before next iteration...`);
                await new Promise(resolve => setTimeout(resolve, options.delay));
            }
        }

        logger.log(`\nCompleted processing ${loopCount * epochsPerCall} total epochs`);
    });

middlewareCmd
    .command("add-node")
    .description("Add a new node to an L1")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNodeID())
    .addArgument(ArgHex("blsKey", "BLS public key"))
    .addOption(new Option("--initial-stake <initialStake>", "Initial stake amount (default: 0)").default('0'))
    .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
    .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .asyncAction({ signer: true }, async (client, middlewareAddress, nodeId, blsKey, options) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

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

        const primaryCollateralAddress = await middlewareSvc.read.PRIMARY_ASSET();
        const primaryCollateral = await getDefaultCollateral(client, primaryCollateralAddress);
        const initialStakeWei = parseUnits(options.initialStake.toString(), await primaryCollateral.read.decimals());

        logger.log("Calling function addNode...");
        const nodeIdHex32 = parseNodeID(nodeId);
        const hash = await middlewareSvc.safeWrite.addNode([nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialStakeWei]);
        logger.log("addNode executed successfully, tx hash:", hash);
    });

middlewareCmd
    .command("complete-validator-registration")
    .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
    .addArgument(ArgBLSPOP())
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, addNodeTxHash, blsProofOfPossession, options) => {
        const opts = program.opts();

        if (!options.pchainTxPrivateKey) {
            options.pchainTxPrivateKey = opts.privateKey!;
        }
        const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance')
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const balancerSvc = await getBalancerValidatorManager(client, await middlewareSvc.read.balancerValidatorManager());

        await completeValidatorRegistration(
            options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
            middlewareSvc,
            balancerSvc,
            client,
            blsProofOfPossession,
            addNodeTxHash,
            initialBalance,
            !options.skipWaitApi
        );
    });

middlewareCmd
    .command("remove-node")
    .description("Remove a node from an L1")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNodeID())
    .asyncAction({ signer: true }, async (client, middlewareAddress, nodeId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Calling function removeNode...");
        const nodeIdHex32 = parseNodeID(nodeId);
        const hash = await middlewareSvc.safeWrite.removeNode([nodeIdHex32]);
        logger.log("removeNode executed successfully, tx hash:", hash);
    });

middlewareCmd
    .command("complete-validator-removal")
    .description("Complete validator removal on the P-Chain and on the middleware after removing a node")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
    .asyncAction({ signer: true }, async (client, middlewareAddress, removeNodeTxHash, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const balancerSvc = await getBalancerValidatorManager(client, await middlewareSvc.read.balancerValidatorManager());
        await requirePChainBallance(client, 50000n, opts.yes);

        await completeValidatorRemoval(
            options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
            middlewareSvc,
            balancerSvc,
            client,
            removeNodeTxHash,
            !options.skipWaitApi,
            options.nodeId.length > 0 ? options.nodeId : undefined
        );
    });

middlewareCmd
    .command("init-stake-update")
    .description("Initialize validator stake update and lock")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNodeID())
    .argument("newStake", "New stake amount")
    .asyncAction({ signer: true }, async (client, middlewareAddress, nodeId, newStake) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const primaryCollateral = await middlewareSvc.read.PRIMARY_ASSET();
        const collateral = await getDefaultCollateral(client, primaryCollateral);
        const decimals = await collateral.read.decimals();
        const newStakeWei = parseUnits(newStake, decimals);
        logger.log("Calling function initializeValidatorStakeUpdate...");
        const nodeIdHex32 = parseNodeID(nodeId);
        const hash = await middlewareSvc.safeWrite.initializeValidatorStakeUpdate([nodeIdHex32, newStakeWei]);
        logger.log("initializeValidatorStakeUpdate executed successfully, tx hash:", hash);
    });

middlewareCmd
    .command("complete-stake-update")
    .description("Complete validator stake update of all or specified node IDs")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
    .asyncAction({ signer: true }, async (client, middlewareAddress, validatorStakeUpdateTxHash, options) => {
        const opts = program.opts();

        if (!options.pchainTxPrivateKey) {
            options.pchainTxPrivateKey = opts.privateKey!;
        }
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await requirePChainBallance(client, 50000n, opts.yes);

        await completeWeightUpdate(
            options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
            middlewareSvc,
            client,
            validatorStakeUpdateTxHash,
            options.nodeId.length > 0 ? options.nodeId : undefined,
        );
    });

middlewareCmd
    .command("calc-operator-cache")
    .description("Calculate and cache stakes for operators")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .asyncAction({ signer: true }, async (client, middlewareAddress, epoch, collateralClass) => {
        logger.log("Calculating and caching stakes...");
        if (!client.account) throw new Error('Client account is required');
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const hash = await middlewareSvc.safeWrite.calcAndCacheStakes([epoch, collateralClass],
            {
                chain: null,
                account: client.account,
            });
        logger.log("calcAndCacheStakes done, tx hash:", hash);
    });

middlewareCmd
    .command("calc-node-stakes")
    .description("Calculate and cache node stakes for all operators")
    .addArgument(argMiddlewareAddress)
    .asyncAction({ signer: true }, async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Calculating node stakes for all operators...");
        const hash = await middlewareSvc.safeWrite.calcAndCacheNodeStakeForAllOperators();
        logger.log("calcAndCacheNodeStakeForAllOperators done, tx hash:", hash);
    });

middlewareCmd
    .command("force-update-nodes")
    .description("Force update operator nodes with stake limit")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .addOption(new Option("--limit-stake <stake>", "Stake limit").default(0n).argParser(ParserAVAX))
    .asyncAction({ signer: true }, async (client, middlewareAddress, operator, options) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Calling forceUpdateNodes...");
        const hash = await middlewareSvc.safeWrite.forceUpdateNodes([operator, options.limitStake]);
        logger.log("forceUpdateNodes executed successfully");
        logger.log("tx hash:", hash);
    });

middlewareCmd
    .command("top-up-operator-validators")
    .description("Top up all operator validators to meet a target continuous fee balance")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .argument("targetBalance", "Target continuous fee balance per validator (in AVAX)")
    .asyncAction({ signer: true }, async (client, middlewareAddress, operator, targetBalance) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const targetBalanceWei = parseUnits(targetBalance, 9);
        if (targetBalanceWei <= BigInt(1e7)) {
            throw new Error("Target balance must be greater than 0.01 AVAX");
        }
        const balancerAddress = await middlewareSvc.read.BALANCER()
        const balancer = await getBalancerValidatorManager(client, balancerAddress);
        const [nodeCount, subnetID] = await Promise.all([middlewareSvc.read.getOperatorNodesLength([operator]), balancer.read.subnetID()]);
        const validators = await getCurrentValidators(client, utils.base58check.encode(hexToUint8Array(subnetID)))

        const validatorsToCheck = await Promise.all(
            A.range(0, Number(nodeCount) - 1)
                .map(async (index) => {
                    const nodeIdHex = await middlewareSvc.read.operatorNodesArray([operator, BigInt(index)]);
                    return validators.find(v => v.nodeID === encodeNodeID(nodeIdHex));
                }))

        const validatorsToTopUp = validatorsToCheck.reduce((acc, validator) => {
            if (validator && validator.balance! < targetBalanceWei - BigInt(1e7)) {
                acc.push({
                    validationId: validator.validationID! as Hex,
                    topup: targetBalanceWei - BigInt(validator.balance!),
                });
            }
            return acc
        }, [] as { validationId: Hex; topup: bigint }[])

        const totalTopUp = validatorsToTopUp.reduce((acc, v) => acc + v.topup, 0n);

        if (validatorsToTopUp.length === 0) {
            logger.log("All operator validators have sufficient balance. No top-up needed.");
            return;
        }

        logger.log(`${validatorsToTopUp.length} validators to top-up for a total of ${formatUnits(totalTopUp, 9)} AVAX.`);
        await requirePChainBallance(client, totalTopUp + BigInt(2e4) * nodeCount, program.opts().yes);
        if (!program.opts().yes) {
            const response = await logger.prompt(`Proceed with topping up validators? (y/n): `);
            if (response.toLowerCase() !== 'y') {
                logger.log("Operation cancelled by user.");
                process.exit(0);
            }
        }

        for (const { validationId, topup } of validatorsToTopUp) {
            logger.log(`\nTopping up validator ${validationId}`);
            const amount = Number(topup) / 1e9
            pipe(await increasePChainValidatorBalance(
                client,
                amount,
                validationId,
                false
            ),
                R.tapError(err => { logger.error(err); process.exit(1) }),)
        }
        logger.log("\nCompleted top-up of operator validators.");
        logger.addData('total_amount', totalTopUp)
        logger.addData('validators', validatorsToTopUp)
    });

middlewareCmd
    .command("get-operator-stake")
    .description("Get operator stake for a specific epoch and collateral class")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
    .asyncAction(async (client, middlewareAddress, operator, epoch, collateralClass) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading operator stake...");
        const val = await middlewareSvc.read.getOperatorStake([operator, epoch, collateralClass]);
        logger.log(val);
    });

middlewareCmd
    .command("get-operator-nodes")
    .description("Get operator nodes")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const nodeCount = await middlewareSvc.read.getOperatorNodesLength([operator]);
        const abi = [getAbiItem({ abi: middlewareSvc.abi, name: 'operatorNodesArray' })] as Abi

        const multicallResult = await client.multicall(
            {
                contracts: A.range(0, Number(nodeCount) - 1).map(i => { return { args: [operator, BigInt(i)], abi, address: middlewareAddress, functionName: 'operatorNodesArray' } })
            }
        )

        const nodes = multicallResult.map((node) => node.error ? "error" : encodeNodeID(node.result as Hex))
        logger.log(nodes)
        logger.addData('nodes', nodes)
    });

middlewareCmd
    .command("get-current-epoch")
    .description("Get current epoch number")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading current epoch...");
        const val = await middlewareSvc.read.getCurrentEpoch();
        logger.log(val);
    });

middlewareCmd
    .command("get-epoch-start-ts")
    .description("Get epoch start timestamp")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, middlewareAddress, epoch) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading epoch start timestamp...");
        const val = await middlewareSvc.read.getEpochStartTs([epoch]);
        logger.log(val);
    });

middlewareCmd
    .command("get-active-nodes-for-epoch")
    .description("Get active nodes for an operator in a specific epoch")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .asyncAction(async (client, middlewareAddress, operator, epoch) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading active nodes for epoch...");
        const nodeIds = (await middlewareSvc.read.getActiveNodesForEpoch([operator, epoch]) as Hex[]).map((b: Hex) => encodeNodeID(b));
        logger.log(nodeIds);
        logger.addData('nodeIds', nodeIds);
    });

middlewareCmd
    .command("get-operator-nodes-length")
    .description("Get current number of nodes for an operator")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading operator nodes length...");
        const length = await middlewareSvc.read.getOperatorNodesLength([operator]);
        logger.log(length);
    });

middlewareCmd
    .command("get-node-stake-cache")
    .description("Get node stake cache for a specific epoch and validator")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNumber("epoch", "Epoch number"))
    .addArgument(ArgHex("validationId", "Validation ID"))
    .asyncAction(async (client, middlewareAddress, epoch, validationId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading node stake cache...");
        const val = await middlewareSvc.read.nodeStakeCache([epoch, validationId]);
        logger.log(val);
    });

middlewareCmd
    .command("get-operator-locked-stake")
    .description("Get operator locked stake")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading operator locked stake...");
        const val = await middlewareSvc.read.operatorLockedStake([operator]);
        logger.log(val);
    });

middlewareCmd
    .command("node-pending-removal")
    .description("Check if node is pending removal")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgHex("validationId", "Validation ID"))
    .asyncAction(async (client, middlewareAddress, validationId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading nodePendingRemoval...");
        const val = await middlewareSvc.read.nodePendingRemoval([validationId]);
        logger.log(val);
    });

middlewareCmd
    .command("get-operator-used-stake")
    .description("Get operator used stake from cache")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading operator used stake cached...");
        const val = await middlewareSvc.read.getOperatorUsedStakeCached([operator]);
        logger.log(val);
    });

middlewareCmd
    .command("get-operator-available-stake")
    .description("Get operator available stake")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const availableStake = await middlewareSvc.read.getOperatorAvailableStake([operator]);
        logger.log(`Operator ${operator} available stake: ${availableStake}`);
    });

middlewareCmd
    .command("get-all-operators")
    .description("Get all operators registered")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading all operators from middleware...");
        const operators = await middlewareSvc.read.getAllOperators();
        logger.log(operators);
    });

middlewareCmd
    .command("get-collateral-class-ids")
    .description("Get all collateral class IDs from the middleware")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const collateralClassIds = await middlewareSvc.read.getCollateralClassIds();
        logger.log("Collateral class IDs:", collateralClassIds);
    });

middlewareCmd
    .command("get-active-collateral-classes")
    .description("Get active collateral classes (primary and secondary)")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const result = await middlewareSvc.read.getActiveCollateralClasses();
        logger.log("Active collateral classes - Primary:", result[0], "Secondaries:", result[1]);
    });

middlewareCmd
    .command("node-logs")
    .description("Get middleware node logs")
    .addArgument(argMiddlewareAddress)
    .addOption(new Option("--node-id <nodeId>", "Node ID to filter logs").default(undefined).argParser(ParserNodeID))
    .addOption(new Option('--snowscan-api-key <string>', "Snowscan API key").default(""))
    .asyncAction(async (client, middlewareAddress, options) => {
        logger.log(`nodeId: ${options.nodeId}`);
        const middleware = await getL1Middleware(client, middlewareAddress);
        logger.log("Reading logs from middleware and balancer...");

        const to = await client.getBlockNumber();
        const from = await blockAtTimestamp(client, BigInt(await middleware.read.START_TIME()));
        const snowscanApiKey = options.snowscanApiKey;
        const bar = snowscanApiKey ? undefined : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        if (bar) bar.start(0, 0);

        const logsProm: Promise<DecodedEvent[]>[] = []
        logsProm.push(GetContractEvents(
            client,
            middleware.address,
            Number(from),
            Number(to),
            L1MiddlewareABI,
            ["NodeAdded", "NodeRemoved", "NodeStakeUpdated"],
            snowscanApiKey,
            snowscanApiKey ? false : true,
            bar
        ));

        const [l1ValidatorManagerAddress, balancerAddress] = await middleware.multicall(['BALANCER', 'balancerValidatorManager'])
        const completeEventsContractAddress = l1ValidatorManagerAddress as Hex || balancerAddress as Hex;

        if (completeEventsContractAddress) {
            logsProm.push(GetContractEvents(
                client,
                completeEventsContractAddress,
                Number(from),
                Number(to),
                BalancerValidatorManagerABI,
                undefined,
                snowscanApiKey,
                snowscanApiKey ? false : true,
                bar
            ));
        }
        const balancer = await getBalancerValidatorManager(client, balancerAddress as Hex);

        const allLogs = await Promise.all(logsProm);
        let logs = allLogs.flat().sort((a, b) => Number(a.blockNumber - b.blockNumber));
        logs = await fillEventsNodeId(balancer, logs);

        const logOfInterest = groupEventsByNodeId(logs.map((log: DecodedEvent) => {
            log.address = log.address.toLowerCase() === middleware.address.toLowerCase() ? "Middleware" : "ValidatorManager";
            return log;
        }))

        if (options.nodeId != undefined) {
            const nodeIdHex32 = parseNodeID(options.nodeId);
            logger.log('\t\t\t' + color.blue(options.nodeId));
            logger.table(logOfInterest[nodeIdHex32] || []);
        } else {
            for (const [key, value] of Object.entries(logOfInterest)) {
                const nodeId = encodeNodeID(key as Hex);
                logger.log('\t\t\t\t\t\t' + color.blue(nodeId));
                logger.table(value);
            }
        }
    });

middlewareCmd
    .command("get-last-node-validation-id")
    .description("Set middleware log level")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgNodeID())
    .asyncAction(async (client, middlewareAddress, nodeId) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const balancerAddress = await middlewareSvc.read.balancerValidatorManager();
        const balancerSvc = await getBalancerValidatorManager(client, balancerAddress);
        logger.log(`Fetching last validation ID`);

        const nodeIdHex = parseNodeID(nodeId);
        const rawValidationId = await balancerSvc.read.getNodeValidationID([nodeIdHex]);
        let validationId: Hex;
        if (parseInt(rawValidationId, 16) === 0) {
            const toBlock = await blockAtTimestamp(client, BigInt(await middlewareSvc.read.START_TIME()));
            const fromBlock = await client.getBlockNumber();
            const event = await collectEventsInRange(fromBlock, toBlock, 1, (opts) => middlewareSvc.getEvents.NodeAdded({ nodeId: nodeIdHex }, opts));
            if (event.length === 0) {
                throw new Error(`Node ID ${nodeId} never registered in the middleware`);
            }
            validationId = event[0].args.validationID!;
        } else {
            validationId = rawValidationId;
        }
        logger.log(`Last validationID: ${validationId}`);
    });

middlewareCmd
    .command("to-vault-epoch")
    .description("convert middleware epoch to a vault epoch")
    .addArgument(argMiddlewareAddress)
    .addArgument(argVaultAddress)
    .addArgument(ArgNumber("middlewareEpoch", "Middleware epoch number"))
    .asyncAction(async (client, middlewareAddress, vaultAddress, middlewareEpoch) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const vaultSvc = await getVaultTokenized(client, vaultAddress);
        const middlewareEpochTs = await middlewareSvc.read.getEpochStartTs([middlewareEpoch]);
        const vaultEpoch = await vaultSvc.read.epochAt([middlewareEpochTs]);
        logger.log(`Vault epoch at middleware epoch ${middlewareEpoch} (timestamp: ${middlewareEpochTs}) is ${vaultEpoch}`);
    });

middlewareCmd
    .command("update-window-ends-ts")
    .description("Get the end timestamp of the last completed middleware epoch window")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const [currentEpoch, updateWindow] = await middlewareSvc.multicall(['getCurrentEpoch', 'UPDATE_WINDOW'])
        const lastEpochStartTs = await middlewareSvc.read.getEpochStartTs([currentEpoch])
        logger.log(`Window ends at: ${lastEpochStartTs + updateWindow}`);
    });

middlewareCmd
    .command("vault-to-middleware-epoch")
    .description("convert vault epoch to a middleware epoch")
    .addArgument(argMiddlewareAddress)
    .addArgument(argVaultAddress)
    .addArgument(ArgNumber("vaultEpoch", "Vault epoch number"))
    .asyncAction(async (client, middlewareAddress, vaultAddress, vaultEpoch) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const vaultSvc = await getVaultTokenized(client, vaultAddress);
        const vaultEpochStartTs = await vaultSvc.read.epochDuration() * vaultEpoch + await vaultSvc.read.epochDurationInit();
        const middlewareEpoch = await middlewareSvc.read.getEpochAtTs([vaultEpochStartTs]);
        logger.log(`Middleware epoch at vault epoch ${vaultEpoch} (timestamp: ${vaultEpochStartTs}) is ${middlewareEpoch}`);
    });

middlewareCmd
    .command("set-vault-manager")
    .description("Set vault manager")
    .addArgument(argMiddlewareAddress)
    .addArgument(argMiddlewareVaultManagerAddress)
    .asyncAction({ signer: true }, async (client, middlewareAddress, vaultManagerAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        await middlewareSvc.safeWrite.setVaultManager([vaultManagerAddress])
        logger.log(`Set vault manager to ${vaultManagerAddress} on middleware ${middlewareAddress} ok`);
    });

middlewareCmd
    .command("get-vault-manager")
    .description("Get vault manager")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const vaultManagerAddress = await middlewareSvc.read.getVaultManager();
        logger.log(`Vault manager for middleware ${middlewareAddress}: ${vaultManagerAddress}`);
    });

middlewareCmd
    .command("get-operator-validation-ids")
    .description("Get operator validation IDs")
    .addArgument(argMiddlewareAddress)
    .addArgument(argOperatorAddress)
    .asyncAction(async (client, middlewareAddress, operator) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const validationIDs = await middlewareSvc.read.getOperatorValidationIDs([operator]);
        logger.log(`Validation IDs for operator ${operator}: ${validationIDs.join(', ')}`);
    });

middlewareCmd
    .command("info-account")
    .description("Get account info")
    .addArgument(argMiddlewareAddress)
    .addArgument(ArgAddress("account", "Account address"))
    .asyncAction(async (client, middlewareAddress, account) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const [owner, operators, epoch, balancerAddress] = await middlewareSvc.multicall(['owner', 'getAllOperators', 'getCurrentEpoch', 'BALANCER']);
        const roles = getRoles(middlewareSvc);
        const accessControl = await getAccessControl(client, middlewareAddress);
        const hasRole = await accessControl.multicall(roles.map(role => { return { name: 'hasRole', args: [ensureRoleHex(role), account] } }));
        logger.log(`Account ${account} has the following rights: `);
        if (account === owner) {
            logger.log(`L1 owner`);
        }
        if (hasRole.some(role => role)) {
            logger.log(`Middleware roles: `);
            logger.log("  " + roles.filter((_, index) => hasRole[index]).join('\n  '));
        }
        if (operators.includes(account)) {
            const balancerSvc = await getBalancerValidatorManager(client, balancerAddress);
            const [stake, validationIDs] = await middlewareSvc.multicall([
                { name: 'getOperatorStake', args: [account, 1, BigInt(epoch)] },
                { name: 'getOperatorValidationIDs', args: [account] }]);
            const validators = await balancerSvc.multicall(validationIDs.flatMap(id => { return [{ name: 'getValidator', args: [id] }, { name: 'isValidatorPendingWeightUpdate', args: [id] }] }));
            logger.log(`Operator with stake ${stake} and the following validators: `);
            const subnetIdHex = await balancerSvc.read.subnetID();
            const pChainValidators = await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIdHex)));
            const formated: { [key: string]: any } = {};
            for (let i = 0; i < validators.length; i += 2) {
                const validator = validators[i] as Validator;
                const pendingWeightUpdate = validators[i + 1];
                const status = ValidatorStatusNames[validator.status == ValidatorStatus.Active && pendingWeightUpdate ? ValidatorStatus.PendingStakeUpdated : validator.status];
                const pChainValidator = pChainValidators.find(v => v.nodeID === validator.nodeID);
                formated[encodeNodeID(validator.nodeID)] = { NodeID: encodeNodeID(validator.nodeID), status, weight: validator.weight, ValidationId: validationIDs[i / 2], continuousAVAXBalance: parseUnits(pChainValidator?.balance?.toString() ?? '0', 9) }
            }
            logger.logJsonTree(formated);
        }
    });

middlewareCmd
    .command("info")
    .description("Get general information about the middleware")
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        logger.log("Fetching middleware information...");

        const results = await middlewareSvc.multicall([
            'owner',
            'BALANCER',
            'PRIMARY_ASSET_CLASS',
            'PRIMARY_ASSET',
            'WEIGHT_SCALE_FACTOR',
            'UPDATE_WINDOW',
            'START_TIME',
            'getCurrentEpoch',
            'getAllOperators',
            'getCollateralClassIds',
            'lastGlobalNodeStakeUpdateEpoch',
            'getVaultManager'
        ]);

        const info = {
            middlewareAddress: middlewareSvc.address,
            owner: results[0] as Hex,
            balancerValidatorManager: results[1] as Hex,
            primaryAssetClass: results[2]?.toString(),
            primaryAsset: results[3] as Hex,
            weightScaleFactor: results[4]?.toString(),
            updateWindow: results[5]?.toString(),
            startTime: new Date(Number(results[6]) * 1000).toLocaleString(),
            currentEpoch: results[7]?.toString(),
            operatorsCount: (results[8] as Hex[]).length,
            collateralClassIds: (results[9] as bigint[])?.map(id => id.toString()),
            lastGlobalNodeStakeUpdateEpoch: results[10]?.toString(),
            vaultManager: results[11] as Hex,
        };

        logger.logJsonTree(info);
        logger.addData('middlewareInfo', info);
    });

middlewareCmd
    .command('info-operators')
    .description('Get operators info')
    .addArgument(argMiddlewareAddress)
    .asyncAction(async (client, middlewareAddress) => {
        const middlewareSvc = await getL1Middleware(client, middlewareAddress);
        const balancerAddress = await middlewareSvc.read.balancerValidatorManager();
        const balancerSvc = await getBalancerValidatorManager(client, balancerAddress);

        logger.log("Fetching operators information...");

        const results = await middlewareSvc.multicall([
            'getCurrentEpoch',
            'getAllOperators',
            'lastGlobalNodeStakeUpdateEpoch',
            'getVaultManager',
            'PRIMARY_ASSET_CLASS',
            "WEIGHT_SCALE_FACTOR"
        ]);

        const operatorsInfoFlaten = await middlewareSvc.multicall(results[1].flatMap(operator => {
            return [
                { name: 'getOperatorStake', args: [operator, results[0], results[4]] },
                { name: 'getOperatorUsedStakeCached', args: [operator] },
                { name: 'operatorLockedStake', args: [operator] },
                { name: 'getActiveNodesForEpoch', args: [operator, results[0]] }
            ]
        }))

        const operatorValidatorsValidationIDs = await balancerSvc.multicall(operatorsInfoFlaten.filter(info => Array.isArray(info)).flatMap((activeNodes: Hex[]) => {
            return activeNodes.map((nodeId) => {
                return { name: 'getNodeValidationID', args: [nodeId.replace("000000000000000000000000", "") as Hex] }
            })
        }))

        const operatorValidators = await balancerSvc.multicall(operatorValidatorsValidationIDs.map((validationID: Hex) => {
            return { name: 'getValidator', args: [validationID] }
        }))

        const operatorNodesStake = await middlewareSvc.multicall(operatorValidatorsValidationIDs.flatMap((validationID: Hex) => {
            return [{ name: 'getNodeStake', args: [results[2], validationID] }]
        }))

        const reducedOperatorValidators = operatorValidators.reduce((acc, validator, index) => {
            acc[validator.nodeID] = { ...validator, validationID: operatorValidatorsValidationIDs[index], stake: Number(operatorNodesStake[index]) };
            return acc;
        }, {} as Record<Hex, Validator & { validationID: Hex, stake: Number }>);

        const operatorsInfoArr = results[1].map((operator, index) => {
            return {
                operator,
                stake: Number(operatorsInfoFlaten[index * 4]),
                usedStake: Number(operatorsInfoFlaten[index * 4 + 1]),
                lockedStake: Number(operatorsInfoFlaten[index * 4 + 2]),
                acitveNodes: (operatorsInfoFlaten[index * 4 + 3] as Hex[]).map((nodeId) => {
                    nodeId = nodeId.replace("000000000000000000000000", "") as Hex;
                    return {
                        nodeID: encodeNodeID(reducedOperatorValidators[nodeId].nodeID),
                        validationID: reducedOperatorValidators[nodeId].validationID,
                        status: ValidatorStatusNames[Number(reducedOperatorValidators[nodeId].status)],
                        startingWeight: Number(reducedOperatorValidators[nodeId].startingWeight),
                        weight: Number(reducedOperatorValidators[nodeId].weight),
                        stake: Number(reducedOperatorValidators[nodeId].weight) * Number(results[5]),
                        startTime: new Date(Number(reducedOperatorValidators[nodeId].startTime) * 1000).toLocaleString()
                    }
                })
            }
        })

        logger.logJsonTree(operatorsInfoArr);
    });

middlewareCmd
    .command('weight-sync')
    .description('Watch for operators weight changes')
    .addArgument(argMiddlewareAddress)
    .addOption(new Option('-e, --epochs <number>', 'Number of epochs to watch').argParser(Number))
    .addOption(new Option('-l, --loop-epochs <number>', 'Number of epochs to loop').argParser(Number))
    .asyncAction({ signer: true }, async (client, middlewareAddress, options) => {
        const middleware = await getL1Middleware(client, middlewareAddress);

        const [lastGlobalNodeStakeUpdateEpoch, currentEpoch, updateWindow] = await middleware.multicall(['lastGlobalNodeStakeUpdateEpoch', 'getCurrentEpoch', 'UPDATE_WINDOW']);
        let epochsPerCall;
        let loopCount;
        if (options.epochs || options.loopEpochs) {
            epochsPerCall = options.epochs || 1;
            loopCount = options.loopEpochs || 1;
        } else {
            epochsPerCall = currentEpoch - lastGlobalNodeStakeUpdateEpoch;
            loopCount = epochsPerCall > 50 ? Math.ceil(epochsPerCall / 50) : 1;
            epochsPerCall = Math.ceil(epochsPerCall / loopCount);
        }

        const startEpoch = await middleware.read.getEpochStartTs([currentEpoch]);
        const now = Date.now() / 1000;

        if (now < startEpoch + updateWindow) {
            throw new Error(`Not enough time has passed since the start of the current epoch. Please wait until the update window has passed(${startEpoch + updateWindow - now} seconds)`);
        }

        logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);
        for (let i = 0; i < loopCount; i++) {
            logger.log(`\nIteration ${i + 1}/${loopCount}`);
            const hash = await middleware.safeWrite.manualProcessNodeStakeCache([epochsPerCall]);
            logger.log("manualProcessNodeStakeCache done, tx hash:", hash);
        }

        const processedEpochs = Math.max(epochsPerCall * loopCount, currentEpoch - lastGlobalNodeStakeUpdateEpoch);

        const [collateralClasses, operators] = await middleware.multicall(['getCollateralClassIds', 'getAllOperators']);

        const processedEpochsRange: number[] = Array.from({ length: processedEpochs }, (_, i) => i + lastGlobalNodeStakeUpdateEpoch)
        for (const epoch of processedEpochsRange) {
            for (const collateralClass of collateralClasses) {
                logger.log(`Processing epoch ${epoch} for collateral class ${collateralClass}`);
                await middleware.safeWrite.calcAndCacheStakes([epoch, collateralClass]);
            }
        }

        const predictions = await predictForceUpdateImpact(client, middleware, operators as Hex[]);

        for (const prediction of predictions) {
            if (prediction.willLoseWeight) {
                logger.log(`Operator ${prediction.operator} will ${prediction.willLoseWeight ? 'lose' : 'gain'} weight`);
                logger.log(`Current total stake: ${prediction.currentTotalStake}`);
                logger.log(`Capped total stake: ${prediction.cappedTotalStake}`);
                logger.log(`Registered stake: ${prediction.registeredStake}`);
                logger.log(`Stake deficit: ${prediction.stakeDeficit}`);
                logger.log(`Active nodes count: ${prediction.activeNodesCount}`);
                const hash = await middleware.safeWrite.forceUpdateNodes([prediction.operator, 0n]);
                logger.addData('forceUpdateNodes', { operator: prediction.operator, stakeDeficit: prediction.stakeDeficit.toString(), txHash: hash });
            } else {
                logger.log(`Operator ${prediction.operator} will not lose weight`);
            }
        }
        const balancerAddress = await middleware.read.BALANCER();
        const balancer = await getBalancerValidatorManager(client, balancerAddress);

        let pendingRemovalNodes: { nodeID: Hex, validationID: Hex, txHash?: Hex }[] = [];

        if (operators.length > 0) {
            const subnetId = utils.base58check.encode(hexToBytes(await balancer.read.subnetID()));
            const validators = await getCurrentValidators(client, subnetId);
            const startBlock = await blockAtTimestamp(client, BigInt(await middleware.read.getEpochStartTs([currentEpoch - 2])));
            const logs = await middleware.getLogs({ event: "NodeRemoved", fromBlock: startBlock });

            const combinedNodes = Array.from(new Set([...validators.map(v => ({ nodeID: parseNodeID(v.nodeID as NodeId), validationID: bytesToHex(utils.base58check.decode(v.validationID!)) })), ...logs.map(l => ({ nodeID: l.args.nodeId!, validationID: l.args.validationID!, txHash: l.transactionHash! }))]));

            const statuses = await balancer.multicall(combinedNodes.map((v) => {
                return { name: 'getValidator', args: [v.validationID] }
            }));
            statuses.forEach((status: any, i: number) => {
                logger.log(`Node ${combinedNodes[i].nodeID} status: ${status.status}`);
            });
            pendingRemovalNodes = combinedNodes.filter((_, i) => statuses[i].status === ValidatorStatus.PendingRemoved);
        }
        const nodesRemoved = []
        if (pendingRemovalNodes.length > 0) {
            logger.log(`Found ${pendingRemovalNodes.length} nodes pending removal`);
            const processedTxHashes: Hex[] = [];

            for (const pendingNode of pendingRemovalNodes) {
                if (!pendingNode.txHash) {
                    pendingNode.txHash = await balancer.safeWrite.resendValidatorRemovalMessage([pendingNode.validationID]);
                    logger.log(`Resent validator removal message for node ${pendingNode.nodeID}, tx hash: ${pendingNode.txHash}`);
                }
                if (processedTxHashes.includes(pendingNode.txHash)) continue;
                processedTxHashes.push(pendingNode.txHash);
                logger.log(`Node pending removal found: ${pendingNode.nodeID}`);
                try {
                    const { nodes } = await completeValidatorRemoval(
                        client,
                        middleware,
                        balancer,
                        client,
                        pendingNode.txHash,
                        false
                    );
                    nodesRemoved.push(...nodes);
                } catch (error) {
                    logger.error(error);
                }
            }
        }
        logger.log(nodesRemoved)
        logger.addData("nodesRemoved", nodesRemoved)
    });

    return middlewareCmd;
}
