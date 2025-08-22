import { ExtendedWalletClient, ExtendedPublicClient } from "./client";
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from "viem";

async function registerOperator(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry'],
    metadataUrl: string,
    account: Account
) {
    console.log("Registering operator...");

        const hash = await operatorRegistry.safeWrite.registerOperator(
            [metadataUrl],
            { chain: null, account }
        );

        console.log("Registered operator successfully, Transaction hash:", hash);

}

async function listOperators(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry']
) {
    console.log("Listing operators...");

        const result = await operatorRegistry.read.getAllOperators();

        const [addresses, metadataUrls] = result;
        const totalOperators = addresses.length;

        console.log(`\nTotal operators: ${totalOperators}\n`);

        for (let i = 0; i < totalOperators; i++) {
            console.log(`Operator ${i + 1}:`);
            console.log(`  Address: ${addresses[i]}`);
            console.log(`  Metadata URL: ${metadataUrls[i]}\n`);
        }

}

export { registerOperator, listOperators };
