import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from "viem";
import { logger } from './lib/logger';

async function registerOperator(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry'],
    metadataUrl: string,
    account: Account
) {
    logger.log("Registering operator...");

    const hash = await operatorRegistry.safeWrite.registerOperator(
        [metadataUrl],
        { chain: null, account }
    );

    logger.log("Registered operator successfully, Transaction hash:", hash);

}

async function listOperators(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry']
) {
    const result = await operatorRegistry.read.getAllOperators();

    const [addresses, metadataUrls] = result;
    const totalOperators = addresses.length;

    logger.log(`\nTotal operators: ${totalOperators}\n`);

    const operators = Array.from({ length: totalOperators }, (_, i) => ({
        address: addresses[i],
        metadataUrl: metadataUrls[i]
    }));
    logger.logJsonTree(operators);

}

export { registerOperator, listOperators };
