import { Config } from "./config";
import { WalletClient, PublicClient } from "viem";

export async function registerL1(
    config: Config,
    client: WalletClient,
    validatorManager: string,
    l1Middleware: string,
    metadataUrl: string,
) {
    console.log("Registering L1...");

    try {
        // @ts-ignore
        const hash = await client.writeContract({
            address: config.l1Registry as `0x${string}`,
            abi: config.abis.L1Registry,
            functionName: "registerL1",
            args: [validatorManager, l1Middleware, metadataUrl],
            value: BigInt(10000000000000000),
        });

        console.log("Registered L1 successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function setL1MetadataUrl(
    client: WalletClient,
    l1RegistryAddress: `0x${string}`,
    l1RegistryAbi: any,
    l1Address: `0x${string}`,
    metadataUrl: string
) {
    console.log("Setting L1 Metadata URL...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: l1RegistryAddress,
            abi: l1RegistryAbi,
            functionName: 'setMetadataURL',
            args: [l1Address, metadataUrl],
            chain: null,
            account: client.account || null,
        });

        console.log("Set L1 Metadata URL successfully, Transaction hash:", hash);
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

export async function getL1s(client: PublicClient, l1RegistryAddress: `0x${string}`, l1RegistryAbi: any) {
    console.log("Getting L1s...");

    try {
        // Get total number of L1s
        const totalL1s = await client.readContract({
            address: l1RegistryAddress,
            abi: l1RegistryAbi,
            functionName: 'totalL1s',
            args: [],
        });

        console.log("Total L1s:", Number(totalL1s));

        // Get each L1
        const l1s = [];
        for (let i = 0; i < Number(totalL1s); i++) {
            const l1 = await client.readContract({
                address: l1RegistryAddress,
                abi: l1RegistryAbi,
                functionName: 'getL1At',
                args: [i],
            }) as [`0x${string}`, `0x${string}`, string];
            l1s.push(l1);
        }

        for (const l1 of l1s) {
            console.log("L1 Address:", l1[0]);
            console.log("L1 Middleware:", l1[1]);
            console.log("L1 Metadata URL:", l1[2]);
        }

    } catch (error) {
        console.error("Failed to get L1s:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
        return [];
    }
}
