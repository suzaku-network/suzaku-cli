import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { getVaultTokenized, getL1Middleware, getVaultManager, getL1Registry, getOperatorL1OptInService, getOperatorStakes } from '@suzaku-network/suzaku-sdk/core';
import { type Hex, type Account, parseUnits } from 'viem';
import { logger } from './lib/logger';
import { ExtendedPublicClient } from './client';
import { argVaultAddress, getVaultInfo } from './vault';
import { SuzakuCliProgram } from './cli';
import { ArgAddress, ArgBigInt } from './lib/cliParser';
import { argOperatorAddress } from './operator';

// info: list all vaults and show its collateral class, max limit, and times. Show the l1 stakes
export async function info(vaultManager: SuzakuContract['VaultManager'], client: ExtendedPublicClient) {

    const [vaultCount, middlewareAddress] = await vaultManager.multicall(['getVaultCount', "middleware"]);

    const vaults = await vaultManager.multicall(Array.from({ length: Number(vaultCount) }).map((_, i) => ({ name: 'getVaultAtWithTimes', args: [BigInt(i)] })));

    let vaultsWithInfo = [];
    for (const [addr, enableTime, disableTime] of vaults) {
        const vault = await getVaultTokenized(client, addr);
        vaultsWithInfo.push({
            enableTime: enableTime === 0 ? "Never" : new Date(enableTime * 1000).toLocaleString(),
            disableTime: disableTime === 0 ? "Never" : new Date(disableTime * 1000).toLocaleString(),
            ...await getVaultInfo(client, vault, await getL1Middleware(client, middlewareAddress))
        });
    }
    return { middleware: middlewareAddress, vaults: vaultsWithInfo };
}


/* --------------------------------------------------
* VAULT MANAGER
* -------------------------------------------------- */
export const argMiddlewareVaultManagerAddress = ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager contract address");
export function addVaultManagerCommands(program: SuzakuCliProgram) {

    const vaultManagerCmd = program
        .command("vault-manager")
        .description("Commands to interact with the Vault Manager contract of an L1");

    vaultManagerCmd
        .command("register-vault-l1")
        .description("Register a vault for L1 staking")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(argVaultAddress)
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .argument("maxLimit", "Maximum limit (in decimal format)")
        .asyncAction({ signer: true }, async (client, middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            // instantiate VaultManager contract
            const vaultManager = await getVaultManager(client, middlewareVaultManagerAddress);
            const vault = await getVaultTokenized(client, vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            logger.log("Registering Vault L1...");

            const hash = await vaultManager.safeWrite.registerVault([vaultAddress, collateralClass, maxLimitWei]);
            logger.log("Vault registered, tx hash:", hash);
        });

    vaultManagerCmd
        .command("update-vault-max-l1-limit")
        .description("Update the maximum L1 limit for a vault")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(argVaultAddress)
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .argument("maxLimit", "Maximum limit")
        .asyncAction({ signer: true }, async (client, middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManagerAddress);
            const vault = await getVaultTokenized(client, vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            logger.log("Updating Vault Max L1 limit...");

            const hash = await vaultManager.safeWrite.updateVaultMaxL1Limit([vaultAddress, collateralClass, maxLimitWei]);
            logger.log("Max L1 limit updated, tx hash:", hash);
        });

    vaultManagerCmd
        .command("remove-vault")
        .description("Remove a vault from L1 staking")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(argVaultAddress)
        .asyncAction({ signer: true }, async (client, middlewareVaultManager, vaultAddress) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            logger.log("Removing vault...");

            const hash = await vaultManager.safeWrite.removeVault([vaultAddress]);
            logger.log("Vault removed, tx hash:", hash);
        });

    vaultManagerCmd
        .command("get-vault-count")
        .description("Get the number of vaults registered for L1 staking")
        .addArgument(argMiddlewareVaultManagerAddress)
        .asyncAction(async (client, middlewareVaultManager) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            logger.log("Getting vault count...");

            const val = await vaultManager.read.getVaultCount();
            logger.log("Vault count:", val);
        });

    vaultManagerCmd
        .command("get-vault-at-with-times")
        .description("Get the vault address at a specific index along with its registration and removal times")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(ArgBigInt("index", "Vault index"))
        .asyncAction(async (client, middlewareVaultManager, index) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            logger.log("Getting vault at index with times...");

            const [val] = await vaultManager.read.getVaultAtWithTimes([index]);
            logger.log("Vault at index with times:", val);
        });

    vaultManagerCmd
        .command("get-vault-collateral-class")
        .description("Get the collateral class ID associated with a vault")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(argVaultAddress)
        .asyncAction(async (client, middlewareVaultManager, vaultAddress) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            logger.log("Getting vault collateral class...");

            const val = await vaultManager.read.getVaultCollateralClass([vaultAddress]);
            logger.log("Vault collateral class:", val);
        });

    vaultManagerCmd
        .command("info")
        .description("Get information about all vaults registered for L1 staking")
        .addArgument(argMiddlewareVaultManagerAddress)
        .asyncAction(async (client, middlewareVaultManager) => {
            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            logger.log("Getting vault manager info...");

            const [vaultCount, middleware] = await vaultManager.multicall(['getVaultCount', "middleware"]);
            const vaults = await vaultManager.multicall(Array.from({ length: Number(vaultCount) }).map((_, i) => ({ name: 'getVaultAtWithTimes', args: [BigInt(i)] })));
            logger.log("Vault manager info:", { vaultCount, middleware, vaults });
        });
    
    /**
     * --------------------------------------------------
     * OP-STAKES: enumerates the vaults and attempts to read stake for <operator>
     * --------------------------------------------------
     */
    vaultManagerCmd
        .command("opstakes")
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .addArgument(argMiddlewareVaultManagerAddress)
        .addArgument(argOperatorAddress)
        .asyncAction(async (client, middlewareVaultManager, operatorAddress) => {
            logger.log(`Operator: ${operatorAddress}`);

            const vaultManager = await getVaultManager(client, middlewareVaultManager);
            const l1Registry = await getL1Registry(client);
            const operatorL1OptInService = await getOperatorL1OptInService(client);

            const { totalStakesByCollateral, details } = await getOperatorStakes(
                client,
                vaultManager,
                l1Registry,
                operatorL1OptInService,
                operatorAddress
            );

            for (const { vaultAddress, l1Address, stakeValue } of details) {
                logger.log(`    L1: ${l1Address} => stake = ${stakeValue.toString()} (vault=${vaultAddress})`);
            }

            logger.log("\nAggregated stakes by collateral:");
            if (Object.keys(totalStakesByCollateral).length === 0) {
                logger.log("   No stakes found or operator not opted into any L1s this way.");
            } else {
                for (const [collateralAddr, totalWei] of Object.entries(totalStakesByCollateral)) {
                    const floatAmount = Number(totalWei) / 10 ** 18;
                    logger.log(`   Collateral=${collateralAddr} totalStakeWei=${totalWei} => ${floatAmount}`);
                }
            }
        });
    
    // vaultManagerCmd
    //     .command("l1stakes")
    //     .description("Show L1 stakes for a given validator manager")
    //     .addArgument(argValidatorManagerAddress)
    //     .description("Show L1 stakes for a given validator manager")
    //     .asyncAction(async (client,) => {
    //         // TODO: Implement
    //         throw new Error("Not implemented");
    //     });
    return vaultManagerCmd;
}
