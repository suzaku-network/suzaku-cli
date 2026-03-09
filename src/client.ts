import { avalancheFuji, avalanche, anvil } from 'viem/chains'
import { createWalletClient, http, WalletClient, createPublicClient, PublicClient, publicActions, Hex, PublicActions } from 'viem'
import { Account, privateKeyToAccount } from 'viem/accounts'
import { createSafeClient, type SafeClient } from '@safe-global/sdk-starter-kit'
import { getAddresses } from './lib/utils';
import { getLedgerAccount, toSafeProvider } from './lib/ledgerUtils';
import { getCoreWalletAccount } from './lib/coreWalletUtils';
import { chainList } from './lib/chainList';
import { logger } from './lib/logger';
import { createAvalancheWalletClient, type AvalancheWalletClient } from '@avalanche-sdk/client'
// Define the network types
export type Network = 'fuji' | 'mainnet' | 'anvil';
export type Chains = keyof typeof chainList;

export type PChainAddress = `P-${string}`;
export type Addresses = { P: PChainAddress, C: Hex };
export type ExtendedAccount = Account & { pChainAddress: PChainAddress, cSign?: (parameters: { hash: Hex }) => Promise<Hex> };

// Create extended client type that includes public actions and network type
export type ExtendedWalletClient = WalletClient & PublicActions & { network: Network, addresses: Addresses, safe?: SafeClient, ledger?: boolean, account: ExtendedAccount | undefined };
export type ExtendedPublicClient = PublicClient & { network: Network };
export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;

// Overloaded function to generate a client based on the network and optional private key
export async function generateClient(chain: Chains, privateKey: Hex | 'ledger' | "web", safe?: Hex): Promise<ExtendedWalletClient>;
export async function generateClient(chain: Chains, privateKey?: undefined, safe?: Hex): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger' | "web", safe?: Hex): Promise<ExtendedWalletClient | ExtendedPublicClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger' | "web", safe?: Hex): Promise<ExtendedWalletClient | ExtendedPublicClient> {
    const network = chainList[chain].testnet ? 'fuji' : 'mainnet';
    let account: ExtendedAccount | undefined;

    const isLedger = privateKey === 'ledger';
    if (privateKey === 'ledger') {
        const accountIndex = process.env.LEDGER_ACCOUNT_INDEX ? parseInt(process.env.LEDGER_ACCOUNT_INDEX) : 0;
        account = await getLedgerAccount(network, accountIndex);
        // logger.log(`Ledger account ${accountIndex}\nAddress: ${account.address}\nP-Chain Address: ${account.pChainAddress}`);

    } else if (privateKey === "web") {
        account = await getCoreWalletAccount(network);
    } else if (privateKey) {
        account = privateKeyToAccount(privateKey) as ExtendedAccount;
        const addresses = getAddresses(privateKey, network);
        account.address = addresses.C;
        account.pChainAddress = addresses.P;
    }

    if (network !== chain && safe) {
        logger.error(`Error: The chain ${chain} is not supported by safe on ${network} network`);
        process.exit(1);
    }

    if (account) {
        const client = createWalletClient({
            account,
            chain: chainList[chain],
            transport: privateKey === "web" ? (window as any).avalanche : http()
        }).extend(publicActions);
        return {
            ...client,
            network,
            ledger: isLedger,
            safe: safe ? await createSafeClient({
                provider: isLedger ? await toSafeProvider(client, account) : chainList[chain].rpcUrls.default.http[0],
                signer: isLedger ? undefined : privateKey,
                safeAddress: safe,
                txServiceUrl: network === 'fuji' ? 'https://wallet-transaction-fuji.ash.center/api' : 'https://api.safe.global/tx-service/avax/api',
                apiKey: network === 'fuji' ? undefined : process.env.SAFE_API_KEY
            }) : undefined,
            addresses: { C: account.address as Hex, P: account.pChainAddress }
        };
    } else {
        return {
            ...createPublicClient({
                chain: chainList[chain],
                transport: http()
            }).extend(publicActions),
            network
        };
    }
}
