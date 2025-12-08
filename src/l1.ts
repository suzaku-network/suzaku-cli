import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from "viem";
import { logger } from './lib/logger';

export async function registerL1(
    l1Registry: SafeSuzakuContract['L1Registry'],
    balancerAddress: Hex,
    l1Middleware: Hex,
    metadataUrl: string,
    account: Account
) {
    logger.log("Registering L1...");

    const hash = await l1Registry.safeWrite.registerL1(
        [balancerAddress, l1Middleware, metadataUrl],
        { value: BigInt(1000000000000000000), chain: null, account }
    );

    logger.log("Registered L1 successfully, Transaction hash:", hash);

}

export async function setL1MetadataUrl(
    l1Registry: SafeSuzakuContract['L1Registry'],
    l1Address: Hex,
    metadataUrl: string,
    account: Account
) {
    logger.log("Setting L1 Metadata URL...");

    const hash = await l1Registry.safeWrite.setMetadataURL(
        [l1Address, metadataUrl],
        { chain: null, account }
    );

    logger.log("Set L1 Metadata URL successfully, Transaction hash:", hash);

}

export async function setL1Middleware(
    l1Registry: SafeSuzakuContract['L1Registry'],
    validatorManager: Hex,
    newMiddleware: Hex,
    account: Account
) {
    logger.log("Setting L1 Middleware...");

    const hash = await l1Registry.safeWrite.setL1Middleware(
        [validatorManager, newMiddleware],
        { chain: null, account }
    );

    logger.log("Set L1 Middleware successfully, Transaction hash:", hash);

}
