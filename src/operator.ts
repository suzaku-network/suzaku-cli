import { Config } from "./config";
import { WalletClient } from "viem";

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

export { registerOperator };
