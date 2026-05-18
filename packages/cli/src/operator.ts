import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { logger } from './lib/logger';
import { SuzakuCliProgram } from './cli';
import { ArgAddress, ArgURI } from './lib/cliParser';
import { getOperatorRegistry } from '@suzaku-network/suzaku-sdk/core';

export const argOperatorAddress = ArgAddress("operator", "Operator address");
/* --------------------------------------------------
* OPERATOR REGISTRY COMMANDS
* -------------------------------------------------- */
export function addOperatorRegistryCommands(program: SuzakuCliProgram) {
    const operatorRegistryCmd = program
        .command("operator-registry")
        .description("Commands to interact with the Suzaku Operator Registry contract");

    operatorRegistryCmd
        .command("register")
        .description("Register a new operator in the operator registry")
        .addArgument(ArgURI("metadataUrl", "Operator metadata URL"))
        .asyncAction({ signer: true }, async (client, metadataUrl) => {
            const operatorRegistry = await getOperatorRegistry(client);
            logger.log("Registering operator...");

            const hash = await operatorRegistry.safeWrite.registerOperator([metadataUrl]);

            logger.log("Registered operator successfully, Transaction hash:", hash);
        });

    operatorRegistryCmd
        .command("get-all")
        .description("List all operators registered in the operator registry")
        .asyncAction(async (client) => {
            const operatorRegistry = await getOperatorRegistry(client);
            const result = await operatorRegistry.read.getAllOperators();

            const [addresses, metadataUrls] = result;
            const totalOperators = addresses.length;

            logger.log(`\nTotal operators: ${totalOperators}\n`);

            const operators = Array.from({ length: totalOperators }, (_, i) => ({
                address: addresses[i],
                metadataUrl: metadataUrls[i]
            }));
            logger.logJsonTree(operators);
        });
    return operatorRegistryCmd;
}
