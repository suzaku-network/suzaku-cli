import { ExtendedWalletClient, ExtendedPublicClient } from "./client";
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Account } from "viem";
import { logger } from './lib/logger';
import { createSafeClient } from '@safe-global/sdk-starter-kit'
import { encodeFunctionData } from 'viem';

let SIGNER_PRIVATE_KEY: string = '0x...'
const SAFE_ADDRESS = '0x273790fE7700F4541F1c93Ed7619fdEFee47409a'
const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc'
const TX_SERVICE_URL = 'https://wallet-transaction-fuji.ash.center'

async function registerOperator(
    operatorRegistry: SafeSuzakuContract['OperatorRegistry'],
    metadataUrl: string,
    account: Account
) {
    logger.log("Registering operator...");

    // const hash = await operatorRegistry.safeWrite.registerOperator(
    //     [metadataUrl],
    //     { chain: null, account }
    // );

    // logger.log("Registered operator successfully, Transaction hash:", hash);

    // Create Safe client
    const safeClient = await createSafeClient({
        provider: RPC_URL,
        signer: SIGNER_PRIVATE_KEY,
        safeAddress: SAFE_ADDRESS,
        txServiceUrl: TX_SERVICE_URL
    })

    // Prepare transaction
    const transactions = [{
        to: operatorRegistry.address as `0x${string}`,
        data: encodeFunctionData({
            abi: operatorRegistry.abi,
            functionName: 'registerOperator',
            args: [metadataUrl]
        }),
        value: '0',
    }]

    // Send transaction
    // If threshold is 1, it will be executed immediately
    // If threshold is greater than 1, it will be executed after the threshold is reached and tx is executed (via Safe UI)
    const txResult = await safeClient.send({ transactions })
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
