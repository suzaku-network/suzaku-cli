import { Config } from "./config";
import { WalletClient } from "viem";

export async function registerL1(config: Config, client: WalletClient, validatorManager: string, l1Middleware: string, metadataUrl: string) {
    console.log("Registering L1...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: config.l1Registry as `0x${string}`,
            abi: config.abis.L1Registry,
            functionName: 'registerL1',
            args: [validatorManager, l1Middleware, metadataUrl]
        });

        console.log("Registered L1 successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function setL1Middleware(
    client: WalletClient,
    l1RegistryAddress: `0x${string}`,
    l1RegistryAbi: any,
    validatorManager: `0x${string}`,
    newMiddleware: `0x${string}`
  ) {
    console.log("Setting L1 Middleware...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: l1RegistryAddress,
            abi: l1RegistryAbi,
            functionName: 'setL1Middleware',
            args: [validatorManager, newMiddleware],
            chain: null,
            account: client.account || null,
        });

        console.log("Set L1 Middleware successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}
