import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from "viem";

export async function registerL1(
    l1Registry: SafeSuzakuContract['L1Registry'],
    balancerAddress: Hex,
    l1Middleware: Hex,
    metadataUrl: string,
    account: Account
) {
    console.log("Registering L1...");

        const hash = await l1Registry.safeWrite.registerL1(
            [balancerAddress, l1Middleware, metadataUrl],
            { value: BigInt(10000000000000000), chain: null, account }
        );

        console.log("Registered L1 successfully, Transaction hash:", hash);

}

export async function setL1MetadataUrl(
    l1Registry: SafeSuzakuContract['L1Registry'],
    l1Address: Hex,
    metadataUrl: string,
    account: Account
) {
    console.log("Setting L1 Metadata URL...");

        const hash = await l1Registry.safeWrite.setMetadataURL(
            [l1Address, metadataUrl],
            { chain: null, account }
        );

        console.log("Set L1 Metadata URL successfully, Transaction hash:", hash);

}

export async function setL1Middleware(
    l1Registry: SafeSuzakuContract['L1Registry'],
    validatorManager: Hex,
    newMiddleware: Hex,
    account: Account
) {
    console.log("Setting L1 Middleware...");

        const hash = await l1Registry.safeWrite.setL1Middleware(
            [validatorManager, newMiddleware],
            { chain: null, account }
        );

        console.log("Set L1 Middleware successfully, Transaction hash:", hash);

}

export async function getL1s(l1Registry: SafeSuzakuContract['L1Registry']) {
    console.log("Getting L1s...");

        // Get total number of L1s
        const totalL1s = await l1Registry.read.totalL1s();

        console.log("Total L1s:", Number(totalL1s));

        // Get each L1
        const l1s = [];
        for (let i = 0n; i < totalL1s; i++) {
            const l1 = await l1Registry.read.getL1At([i]);
            l1s.push(l1);
            console.log("L1 Address:", l1[0]);
            console.log("L1 Middleware:", l1[1]);
            console.log("L1 Metadata URL:", l1[2]);
        }
}
