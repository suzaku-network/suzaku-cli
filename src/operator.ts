import { SafeSuzakuContract } from './lib/viemUtils';
import { logger } from './lib/logger';

async function registerOperator(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry'],
    metadataUrl: string
) {
    logger.log("Registering operator...");

    const hash = await operatorRegistry.safeWrite.registerOperator([metadataUrl]);

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
    logger.addData('operators', operators);

}

export { registerOperator, listOperators };
