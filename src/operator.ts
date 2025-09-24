import { ExtendedWalletClient, ExtendedPublicClient } from "./client";
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from "viem";
import {logger} from './lib/logger';

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
    logger.log("Listing operators...");

    const result = await operatorRegistry.read.getAllOperators();

    const [addresses, metadataUrls] = result;
    const totalOperators = addresses.length;

    logger.log(`\nTotal operators: ${totalOperators}\n`);

    for (let i = 0; i < totalOperators; i++) {
        logger.log(`Operator ${i + 1}:`);
        logger.log(`  Address: ${addresses[i]}`);
        logger.log(`  Metadata URL: ${metadataUrls[i]}\n`);
    }

}

export { registerOperator, listOperators };
