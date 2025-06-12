import { ExtendedWalletClient, ExtendedPublicClient } from "./client";
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from "viem";

async function registerOperator(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry'],
    metadataUrl: string,
    account: Account | undefined
) {
    console.log("Registering operator...");

    try {
        if (!account) throw new Error('Client account is required');
        const hash = await operatorRegistry.safeWrite.registerOperator(
            [metadataUrl],
            { chain: null, account }
        );

        console.log("Registered operator successfully, Transaction hash:", hash);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

async function listOperators(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry']
) {
    console.log("Listing operators...");

    try {
        const result = await operatorRegistry.read.getAllOperators();

        const [addresses, metadataUrls] = result;
        const totalOperators = addresses.length;

        console.log(`\nTotal operators: ${totalOperators}\n`);

        for (let i = 0; i < totalOperators; i++) {
            console.log(`Operator ${i + 1}:`);
            console.log(`  Address: ${addresses[i]}`);
            console.log(`  Metadata URL: ${metadataUrls[i]}\n`);
        }
    } catch (error) {
        console.error("Failed to list operators:", error);
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export { registerOperator, listOperators };
