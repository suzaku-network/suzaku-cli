import { Config, TContract } from "./config";
import { ExtendedWalletClient, ExtendedPublicClient } from "./client";
import { Hex, Abi, GetContractReturnType, Account } from "viem";

export async function registerL1(
    config: Config,
    client: ExtendedWalletClient,
    validatorManager: string,
    l1Middleware: string,
    metadataUrl: string,
) {
    console.log("Registering L1...");

    try {
        // @ts-ignore
        const hash = await client.writeContract({
            address: config.l1Registry as Hex,
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
    l1Registry: TContract['L1Registry'],
    l1Address: Hex,
    metadataUrl: string,
    account:  Account | null = null,
) {
    console.log("Setting L1 Metadata URL...");

    try {
        const hash = await l1Registry.write.setMetadataURL([l1Address, metadataUrl], {chain: null, account} );

        console.log("Set L1 Metadata URL successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function setL1Middleware(
    l1Registry: TContract['L1Registry'],
    validatorManager: Hex,
    newMiddleware: Hex,
    account: Account | null = null,
) {
    console.log("Setting L1 Middleware...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await l1Registry.write.setL1Middleware([validatorManager, newMiddleware], {chain: null, account});

        console.log("Set L1 Middleware successfully, Transaction hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function getL1s(l1RegistryAbi: TContract['L1Registry']) {
    console.log("Getting L1s...");

    try {
        // Get total number of L1s
        const totalL1s = await l1RegistryAbi.read.totalL1s();

        console.log("Total L1s:", Number(totalL1s));

        // Get each L1
        const l1s = [];
        for (let i = 0n; i < totalL1s; i++) {
            const l1 = await l1RegistryAbi.read.getL1At([i])
            l1s.push(l1);
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
