import { Command } from "commander";
import { registerL1 } from "./l1";
import { registerOperator } from "./operator";
import { getConfig } from "./config";
import { generateClient, generatePublicClient } from "./client";
import {
  registerVaultL1,
  updateVaultMaxL1Limit,
  removeVault,
  getVaultCount,
  getVaultAtWithTimes,
  getVaultAssetClass
} from "./vaultManager";
import {
  depositVault,
  withdrawVault,
  claimVault
} from "./vault";

import {
  setL1Limit,
  setOperatorL1Shares
} from "./delegator";

import {
    middlewareRegisterOperator,
    middlewareDisableOperator,
    middlewareRemoveOperator,
    middlewareAddNode,
    middlewareCompleteValidatorRegistration,
    middlewareRemoveNode,
    middlewareCompleteValidatorRemoval,
    middlewareInitWeightUpdate,
    middlewareCompleteWeightUpdate,
    middlewareOperatorCache,
    middlewareCalcNodeWeights,
    middlewareForceUpdateNodes,
    middlewareGetOperatorStake,
    middlewareGetCurrentEpoch,
    middlewareGetEpochStartTs,
    middlewareGetActiveNodesForEpoch,
    middlewareGetOperatorNodesLength,
    middlewareGetNodeWeightCache,
    middlewareGetOperatorLockedStake,
    middlewareNodePendingRemoval,
    middlewareNodePendingUpdate,
    middlewareGetOperatorUsedWeight
  } from "./middleware";

import {
  optInL1,
  optOutL1,
  checkOptInL1,
  optInVault,
  optOutVault,
  checkOptInVault
} from "./operatorOptIn";

import {
    setUpSecurityModule,
    getSecurityModules,
    getSecurityModuleWeights
  } from "./balancer";

async function getDefaultAccount(opts: any): Promise<`0x${string}`> {
  const client = generateClient(opts.privateKey, opts.network);
  return client.account?.address as `0x${string}`;
}

function collectMultiple(value: string, previous: string[]): string[] {
    return previous.concat([value]);
}

  
async function main() {
    const program = new Command();

    program
        .name('suzaku-cli')
        .option('-k, --private-key <privateKey>', '', process.env.PK)
        .option('-n, --network <network>', '', 'fuji')
        .version('0.1.0');

    /* --------------------------------------------------
   * L1 REGISTRY COMMANDS
   * -------------------------------------------------- */
    program
        .command("register-l1")
        .argument("<validatorManager>")
        .argument("<l1Middleware>")
        .argument("<metadataUrl>")
        .action(async (validatorManager, l1Middleware, metadataUrl) => {
        console.log("DEBUG: We are inside the .action callback for register-l1");
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);

        await registerL1(config, client, validatorManager, l1Middleware, metadataUrl);
        });

    /* --------------------------------------------------
    * OPERATOR REGISTRY COMMANDS
    * -------------------------------------------------- */
    program
        .command("register-operator")
        .argument("<metadataUrl>")
        .action(async (metadataUrl) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await registerOperator(config, client, metadataUrl);
        });

    /* --------------------------------------------------
    * VAULT MANAGER
    * -------------------------------------------------- */
    program
        .command("vault-manager-register-vault-l1")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (vaultAddress, assetClass, maxLimit) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await registerVaultL1(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager,
            vaultAddress as `0x${string}`,
            BigInt(assetClass),
            BigInt(maxLimit)
        );
        });

    program
        .command("vault-manager-update-vault-max-l1-limit")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (vaultAddress, assetClass, maxLimit) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await updateVaultMaxL1Limit(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager,
            vaultAddress as `0x${string}`,
            BigInt(assetClass),
            BigInt(maxLimit)
        );
        });

    program
        .command("vault-manager-remove-vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await removeVault(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager,
            vaultAddress as `0x${string}`
        );
        });

    program
        .command("get-vault-count")
        .action(async () => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generatePublicClient(opts.network);
        await getVaultCount(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager
        );
        });

    program
        .command("get-vault-at-with-times")
        .argument("<index>")
        .action(async (index) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generatePublicClient(opts.network);
        await getVaultAtWithTimes(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager,
            BigInt(index)
        );
        });

    program
        .command("get-vault-asset-class")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generatePublicClient(opts.network);
        await getVaultAssetClass(
            client,
            config.vaultManager as `0x${string}`,
            config.abis.VaultManager,
            vaultAddress as `0x${string}`
        );
        });

    /* --------------------------------------------------
    * VAULT DEPOSIT/WITHDRAW/CLAIM
    * -------------------------------------------------- */
    program
        .command("deposit")
        .argument("<vaultAddress>")
        .argument("<amount>")
        .option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address")
        .action(async (vaultAddress, amount, options) => {
        const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await depositVault(
            client,
            vaultAddress as `0x${string}`,
            config.abis.VaultTokenized, 
            onBehalfOf as `0x${string}`,
            BigInt(amount)
        );
        });

    program
        .command("withdraw")
        .argument("<vaultAddress>")
        .argument("<amount>")
        .option("--claimer <claimer>", "Optional claimer")
        .action(async (vaultAddress, amount, options) => {
        const claimer = options.claimer ?? (await getDefaultAccount(program.opts()));
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await withdrawVault(
            client,
            vaultAddress as `0x${string}`,
            config.abis.VaultTokenized,
            claimer as `0x${string}`,
            BigInt(amount)
        );
        });

    program
        .command("claim")
        .argument("<vaultAddress>")
        .argument("<epoch>")
        .option("--recipient <recipient>", "Optional recipient")
        .action(async (vaultAddress, epoch, options) => {
        const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await claimVault(
            client,
            vaultAddress as `0x${string}`,
            config.abis.VaultTokenized,
            recipient as `0x${string}`,
            BigInt(epoch)
        );
        });

    /* --------------------------------------------------
    * L1RestakeDelegator (set-l1-limit / set-operator-l1-shares)
    * -------------------------------------------------- */
    program
        .command("set-l1-limit")
        .argument("<delegatorAddress>")
        .argument("<l1Address>")
        .argument("<limit>")
        .argument("<assetClass>", "Asset class")
        .action(async (delegatorAddress, l1Address, limit, assetClass) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await setL1Limit(
            client,
            delegatorAddress as `0x${string}`,
            config.abis.L1RestakeDelegator,
            l1Address as `0x${string}`,
            BigInt(assetClass),
            BigInt(limit)
        );
        });

    program
        .command("set-operator-l1-shares")
        .argument("<delegatorAddress>")
        .argument("<l1Address>")
        .argument("<operatorAddress>")
        .argument("<shares>")
        .argument("<assetClass>", "Asset class")
        .action(async (delegatorAddress, l1Address, operatorAddress, shares, assetClass) => {
        const opts = program.opts();
        const config = getConfig(opts.network);
        const client = generateClient(opts.privateKey, opts.network);
        await setOperatorL1Shares(
            client,
            delegatorAddress as `0x${string}`,
            config.abis.L1RestakeDelegator,
            l1Address as `0x${string}`,
            BigInt(assetClass),
            operatorAddress as `0x${string}`,
            BigInt(shares)
        );
    });

    /* --------------------------------------------------
    * MIDDLEWARE
    * -------------------------------------------------- */

    // Register operator
    program
        .command("middleware-register-operator")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRegisterOperator(
            client,
            config.middlewareService as `0x${string}`,       // or "0xYOUR_MIDDLEWARE"
            config.abis.MiddlewareService,                  // your actual ABI
            operator as `0x${string}`
            );
    });

    // Disable operator
    program
        .command("middleware-disable-operator")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareDisableOperator(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`
            );
    });

    // Remove operator
    program
        .command("middleware-remove-operator")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveOperator(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`
            );
    });

    // Add node
    program
    .command("middleware-add-node")
    .argument("<nodeId>")
    .argument("<blsKey>")
    .argument("<registrationExpiry>")
    .argument("<pchainThreshold>")
    .argument("<rewardThreshold>")
    .argument("<initialStake>")
    .option("--pchain-address <address>", "", collectMultiple, [])
    .option("--reward-address <address>", "", collectMultiple, [])
    .action(async (nodeId, blsKey, registrationExpiry, pchainThreshold, rewardThreshold, initialStake, options) => {
      const opts = program.opts();
      const config = getConfig(opts.network);
      const client = generateClient(opts.privateKey, opts.network);
      const pchainOwner: [bigint, `0x${string}`[]] = [
        BigInt(pchainThreshold),
        options.pchainAddress as `0x${string}`[]
      ];
      const rewardOwner: [bigint, `0x${string}`[]] = [
        BigInt(rewardThreshold),
        options.rewardAddress as `0x${string}`[]
      ];
      await middlewareAddNode(
        client,
        config.middlewareService as `0x${string}`,
        config.abis.MiddlewareService,
        nodeId as `0x${string}`,
        blsKey as `0x${string}`,
        BigInt(registrationExpiry),
        pchainOwner,
        rewardOwner,
        BigInt(initialStake),
      );
    });

    // Complete validator registration
    program
        .command("middleware-complete-validator-registration")
        .argument("<operator>")
        .argument("<nodeId>")
        .argument("<messageIndex>")
        .option("--pchain-tx-private-key <privateKey>", "", collectMultiple, [])
        .option("--pchain-tx-address <address>", "", collectMultiple, [])
        .option("--bls-proof-of-possession <blsProofOfPossession>", "", collectMultiple, [])
        .option("--add-node-tx-hash <txHash>", "", collectMultiple, [])
        .action(async (operator, nodeId, messageIndex, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCompleteValidatorRegistration(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`,
            nodeId as `0x${string}`,
            BigInt(messageIndex),
            options.pchainTxPrivateKey as string,
            options.pchainTxAddress as string,
            options.blsProofOfPossession as string,
            options.addNodeTxHash as `0x${string}`
            );
    });

    // Remove node
    program
        .command("middleware-remove-node")
        .argument("<nodeId>")
        .action(async (nodeId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveNode(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            nodeId as `0x${string}`
            );
    });

    // Complete validator removal
    program
        .command("middleware-complete-validator-removal")
        .argument("<messageIndex>")
        .action(async (messageIndex) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCompleteValidatorRemoval(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            BigInt(messageIndex)
            );
    });

    // Init weight update
    program
        .command("middleware-init-weight-update")
        .argument("<nodeId>")
        .argument("<newWeight>")
        .action(async (nodeId, newWeight) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareInitWeightUpdate(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            nodeId as `0x${string}`,
            BigInt(newWeight)
            );
    });

    // Complete weight update
    program
        .command("middleware-complete-weight-update")
        .argument("<nodeId>")
        .argument("<messageIndex>")
        .action(async (nodeId, messageIndex) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCompleteWeightUpdate(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            nodeId as `0x${string}`,
            BigInt(messageIndex)
            );
    });

    // Operator cache / calcAndCacheStakes
    program
        .command("middleware-operator-cache")
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareOperatorCache(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            BigInt(epoch),
            BigInt(assetClass)
            );
    });

    // calcAndCacheNodeWeightsForAllOperators
    program
        .command("middleware-calc-node-weights")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCalcNodeWeights(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService
            );
    });

    // forceUpdateNodes
    program
        .command("middleware-force-update-nodes")
        .argument("<operator>")
        .argument("<messageIndex>")
        .action(async (operator, messageIndex) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareForceUpdateNodes(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`,
            BigInt(messageIndex)
            );
    });

    // getOperatorStake (read)
    program
        .command("middleware-get-operator-stake")
        .argument("<operator>")
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (operator, epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorStake(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`,
            BigInt(epoch),
            BigInt(assetClass)
            );
    });

    // getCurrentEpoch (read)
    program
        .command("middleware-get-current-epoch")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetCurrentEpoch(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService
            );
    });

    // getEpochStartTs (read)
    program
        .command("middleware-get-epoch-start-ts")
        .argument("<epoch>")
        .action(async (epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetEpochStartTs(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            BigInt(epoch)
            );
    });

    // getActiveNodesForEpoch (read)
    program
        .command("middleware-get-active-nodes-for-epoch")
        .argument("<operator>")
        .argument("<epoch>")
        .action(async (operator, epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetActiveNodesForEpoch(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`,
            BigInt(epoch)
            );
    });

    // getOperatorNodesLength (read)
    program
        .command("middleware-get-operator-nodes-length")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorNodesLength(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`
            );
    });

    // getNodeWeightCache (read)
    program
        .command("middleware-get-node-weight-cache")
        .argument("<epoch>")
        .argument("<validatorId>")
        .action(async (epoch, validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetNodeWeightCache(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            BigInt(epoch),
            validatorId as `0x${string}`
            );
    });

    // getOperatorLockedStake (read)
    program
        .command("middleware-get-operator-locked-stake")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorLockedStake(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`
            );
    });

    // nodePendingRemoval (read)
    program
        .command("middleware-node-pending-removal")
        .argument("<validatorId>")
        .action(async (validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingRemoval(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            validatorId as `0x${string}`
            );
    });

    // nodePendingUpdate (read)
    program
        .command("middleware-node-pending-update")
        .argument("<validatorId>")
        .action(async (validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingUpdate(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            validatorId as `0x${string}`
            );
    });

    // getOperatorUsedWeight (read)
    program
        .command("middleware-get-operator-used-weight")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorUsedWeight(
            client,
            config.middlewareService as `0x${string}`,
            config.abis.MiddlewareService,
            operator as `0x${string}`
            );
    });


    /**
     * --------------------------------------------------
     * OPERATOR → L1: optIn / optOut / check
     * --------------------------------------------------
     */
    program
        .command("opt-in-l1")
        .description("Operator opts in to a given L1")
        .argument("<l1Address>")
        .action(async (l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            // We'll assume in config you have something like: config.opL1OptIn = "0x..."
            // and config.abis.OpL1OptIn = the ABI.
            const client = generateClient(opts.privateKey, opts.network);
            await optInL1(
            client,
            config.opL1OptIn as `0x${string}`,
            config.abis.OperatorL1OptInService, // or whatever your key is
            l1Address as `0x${string}`,
            );
    });

    program
        .command("opt-out-l1")
        .description("Operator opts out from a given L1")
        .argument("<l1Address>")
        .action(async (l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optOutL1(
            client,
            config.opL1OptIn as `0x${string}`,
            config.abis.OperatorL1OptInService,
            l1Address as `0x${string}`,
            );
    });

    program
        .command("check-opt-in-l1")
        .description("Check if an operator is opted in to a given L1")
        .argument("<operator>")
        .argument("<l1Address>")
        .action(async (operator, l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await checkOptInL1(
            client,
            config.opL1OptIn as `0x${string}`,
            config.abis.OperatorL1OptInService,
            operator as `0x${string}`,
            l1Address as `0x${string}`,
            );
    });


    /**
     * --------------------------------------------------
     * OPERATOR → Vault: optIn / optOut / check
     * --------------------------------------------------
     */
    program
        .command("opt-in-vault")
        .description("Operator opts in to a given Vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optInVault(
            client,
            config.opVaultOptIn as `0x${string}`,
            config.abis.OperatorVaultOptInService,
            vaultAddress as `0x${string}`,
            );
    });

    program
        .command("opt-out-vault")
        .description("Operator opts out from a given Vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optOutVault(
            client,
            config.opVaultOptIn as `0x${string}`,
            config.abis.OperatorVaultOptInService,
            vaultAddress as `0x${string}`,
            );
    });

    program
        .command("check-opt-in-vault")
        .description("Check if an operator is opted in to a given Vault")
        .argument("<operator>")
        .argument("<vaultAddress>")
        .action(async (operator, vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await checkOptInVault(
            client,
            config.opVaultOptIn as `0x${string}`,
            config.abis.OperatorVaultOptInService,
            operator as `0x${string}`,
            vaultAddress as `0x${string}`,
            );
    });

    /**
     * --------------------------------------------------
     * BALANCER
     * --------------------------------------------------
     */
    program
        .command("balancer-set-up-security-module")
        .argument("<middlewareAddress>")
        .argument("<maxWeight>")
        .action(async (middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setUpSecurityModule(
            client,
            config.balancerValidatorManager as `0x${string}`,
            config.abis.BalancerValidatorManager,
            middlewareAddress as `0x${string}`,
            BigInt(maxWeight)
            );
    });

    program
        .command("balancer-get-security-modules")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModules(
            client,
            config.balancerValidatorManager as `0x${string}`,
            config.abis.BalancerValidatorManager
            );
    });

    program
        .command("balancer-get-security-module-weights")
        .argument("<securityModule>")
        .action(async (securityModule) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModuleWeights(
            client,
            config.balancerValidatorManager as `0x${string}`,
            config.abis.BalancerValidatorManager,
            securityModule as `0x${string}`
            );
        });
    
    
    // --------------------------------------------------
    // "help" for help function
    // --------------------------------------------------
    program
        .command("help [command]")
        .description("Display help for a specific command or the entire CLI")
        .action((cmd) => {
            if (cmd) {
                const sub = program.commands.find(c => c.name() === cmd);
                if (!sub) {
                    console.error(`Unknown command: ${cmd}`);
                    program.outputHelp();
                    process.exit(1);
                }
                sub.help();
            } else {
                program.help();
            }
        });
    
    
    program.parse(process.argv);
}

main().catch((err) => console.error(err));
