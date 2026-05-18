import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from "viem";
import { logger } from './lib/logger';
import { argValidatorManagerAddress, SuzakuCliProgram } from './cli';
import { ArgAddress, ArgURI } from './lib/cliParser';
import { getL1Middleware, getL1Registry } from '@suzaku-network/suzaku-sdk/core';
import { argMiddlewareAddress } from './middleware';

 /* --------------------------------------------------
   * L1 REGISTRY COMMANDS
   * -------------------------------------------------- */
  export function addL1Commands(program: SuzakuCliProgram) {
    const l1RegistryCmd = program
        .command("l1-registry")
        .description("Commands to interact with the Suzaku L1 Registry contract");

    l1RegistryCmd
        .command("register")
        .description("Register a new L1 in the L1 registry")
        .addArgument(argMiddlewareAddress)
        .addArgument(ArgURI("metadataUrl", "Metadata URL for the L1"))
        .asyncAction({ signer: true }, async (client, l1Middleware, metadataUrl) => {
            const middleware = await getL1Middleware(client, l1Middleware);
            const balancerAddress = await middleware.read.BALANCER() as Hex;
            const l1Registry = await getL1Registry(client);
            logger.log("Registering L1...");

            const hash = await l1Registry.safeWrite.registerL1(
                [balancerAddress, l1Middleware, metadataUrl],
                { value: BigInt(1000000000000000000), chain: null, account: client.account }
            );

            logger.log("Registered L1 successfully, Transaction hash:", hash);
        });

l1RegistryCmd
    .command("get-all")
    .description("List all L1s registered in the L1 registry")
    .asyncAction(async (client) => {
        const l1Registry = await getL1Registry(client);
        const l1s = await l1Registry.read.getAllL1s();
        const data: { MetadataUrl: string; Balancer: string; Middleware: string }[] = [];
        for (let i = 0; i < l1s[0].length; i++) {
            data.push({
                MetadataUrl: l1s[2][i],
                Balancer: l1s[0][i],
                Middleware: l1s[1][i],
            });
        }
        logger.logJsonTree(data);
    });

l1RegistryCmd
    .command("set-metadata-url")
    .description("Set metadata URL for an L1 in the L1 registry")
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgURI("metadataUrl", "New metadata URL"))
    .asyncAction({ signer: true }, async (client, l1Address, metadataUrl) => {
        const l1Reg = await getL1Registry(client);
        logger.log("Setting L1 Metadata URL...");

        const hash = await l1Reg.safeWrite.setMetadataURL([l1Address, metadataUrl]);

        logger.log("Set L1 Metadata URL successfully, Transaction hash:", hash);
    });

l1RegistryCmd
    .command("set-middleware")
    .description("Set middleware address for an L1 in the L1 registry")
    .addArgument(argValidatorManagerAddress)
    .addArgument(ArgAddress("l1Middleware", "New L1 middleware address"))
    .asyncAction({ signer: true }, async (client, l1Address, l1Middleware) => {
        const l1Reg = await getL1Registry(client);
        logger.log("Setting L1 Middleware...");

        const hash = await l1Reg.safeWrite.setL1Middleware([l1Address, l1Middleware]);

        logger.log("Set L1 Middleware successfully, Transaction hash:", hash);
    });
    return l1RegistryCmd;
}
