import { createSafeClient, type SafeClient } from '@safe-global/sdk-starter-kit'
import { type Hex, type WalletClient, type PublicActions, Account } from 'viem'
import { createAvalancheClient, createAvalancheWalletClient, type AvalancheWalletClient, type AvalancheClient, type PChainActions, type CChainActions } from '@avalanche-sdk/client'
import { privateKeyToAvalancheAccount, type AvalancheAccount } from '@avalanche-sdk/client/accounts'
import { getLedgerAccount, toSafeProvider, type Network } from './lib/ledgerUtils';
import { chainList } from './lib/chainList';
import { logger } from './lib/logger';
import { configDotenv } from 'dotenv';
import path from 'path';

export type { Network };
export type Chains = keyof typeof chainList;
export type PChainAddress = `P-${string}`;
export type Addresses = { P: PChainAddress, C: Hex };

/**
 * Wallet client backed by @avalanche-sdk/client.
 * Includes pChain / xChain / cChain sub-clients out of the box, plus
 * Suzaku-specific properties: network, addresses, safe, ledger.
 *
 * `account` is AvalancheAccount, giving access to:
 *   - account.evmAccount        – viem LocalAccount for EVM/C-chain signing
 *   - account.xpAccount         – P/X-chain signer (different Ledger path)
 *   - account.getXPAddress()    – bech32 P/X address
 *   - account.getEVMAddress()   – 0x EVM address
 */
export type ExtendedWalletClient = AvalancheWalletClient & {
    network: Network;
    addresses: Addresses;
    pChain: PChainActions;
    cChain: CChainActions;
    safe?: SafeClient;
    ledger?: boolean;
};

/**
 * Read-only client backed by @avalanche-sdk/client.
 * Includes pChain / cChain sub-clients unconditionally (app always targets Avalanche/Fuji).
 */
export type ExtendedPublicClient = AvalancheClient & {
    network: Network;
    safe?: SafeClient;
    pChain: PChainActions;
    cChain: CChainActions;
};

export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;

// Overloads
export async function generateClient(chain: Chains, privateKey: Hex | 'ledger', safe?: Hex): Promise<ExtendedWalletClient>;
export async function generateClient(chain: Chains, privateKey?: undefined, safe?: Hex): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex): Promise<ExtendedClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex): Promise<ExtendedClient> {
    // Load .env for the target network
    const envFileBase = path.resolve(__dirname, '..', 'defaults', '.env.');
    const network: Network = chainList[chain].testnet ? 'fuji' : 'mainnet';
    configDotenv({ path: envFileBase + network });
    if ((network as string) !== chain) configDotenv({ path: envFileBase + chain });

    if (network !== chain && safe) {
        logger.error(`Error: The chain ${chain} is not supported by safe on the ${network} network`);
        process.exit(1);
    }

    const isLedger = privateKey === 'ledger';

    if (privateKey) {
        // --- Wallet client ---
        const avalancheAccount = isLedger
            ? await getLedgerAccount(network, process.env.LEDGER_ACCOUNT_INDEX ? parseInt(process.env.LEDGER_ACCOUNT_INDEX) : 0)
            : privateKeyToAvalancheAccount(privateKey);

        const hrp = network === 'mainnet' ? 'avax' : 'fuji';
        const pChainAddress = avalancheAccount.getXPAddress('P', hrp) as PChainAddress;
        const cChainAddress = avalancheAccount.getEVMAddress() as Hex;

        const walletClient = createAvalancheWalletClient({
            account: avalancheAccount,
            chain: chainList[chain],
            transport: { type: 'http' },
        });

        const safeClient = safe
            ? await createSafeClient({
                provider: isLedger
                    ? await toSafeProvider(walletClient, avalancheAccount)
                    : chainList[chain].rpcUrls.default.http[0],
                signer: isLedger ? undefined : privateKey,
                safeAddress: safe,
                txServiceUrl: network === 'fuji'
                    ? 'https://wallet-transaction-fuji.ash.center/api'
                    : 'https://api.safe.global/tx-service/avax/api',
                apiKey: network === 'fuji' ? undefined : process.env.SAFE_API_KEY,
            })
            : undefined;

        return {
            ...walletClient,
            network,
            ledger: isLedger,
            safe: safeClient,
            addresses: { C: cChainAddress, P: pChainAddress },
        } as ExtendedWalletClient;
    }

    // --- Public (read-only) client ---
    const publicClient = createAvalancheClient({
        chain: chainList[chain],
        transport: { type: 'http' },
    });

    const safeClient = safe
        ? await createSafeClient({
            provider: chainList[chain].rpcUrls.default.http[0],
            safeAddress: safe,
            txServiceUrl: network === 'fuji'
                ? 'https://wallet-transaction-fuji.ash.center/api'
                : 'https://api.safe.global/tx-service/avax/api',
            apiKey: network === 'fuji' ? undefined : process.env.SAFE_API_KEY,
        })
        : undefined;

    return {
        ...publicClient,
        network,
        safe: safeClient,
    } as ExtendedPublicClient;
}
