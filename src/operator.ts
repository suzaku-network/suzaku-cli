import { ExtendedWalletClient } from "./client";
import { Config } from "./config";
import { PublicClient, WalletClient } from "viem";

async function registerOperator(
    config: Config,
    client: WalletClient,
    metadataUrl: string
) {
    console.log("Registering operator...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: config.operatorRegistry,
            abi: config.abis.OperatorRegistry,
            functionName: 'registerOperator',
            args: [metadataUrl]
        });

        console.log("Registered operator successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

async function listOperators(
    config: Config,
    client: PublicClient
) {
    console.log("Listing operators...");

    try {
        const result = await client.readContract({
            address: config.operatorRegistry,
            abi: config.abis.OperatorRegistry,
            functionName: 'getAllOperators',
            args: [],
        }) as [string[], string[]];

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
            console.error("Error message:", error.message);
        }
    }
}

export { registerOperator, listOperators };
