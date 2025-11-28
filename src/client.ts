import { avalancheFuji, avalanche, anvil } from 'viem/chains'
import { createWalletClient, http, WalletClient, createPublicClient, PublicClient, publicActions, Hex, PublicActions  } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createSafeClient, type SafeClient } from '@safe-global/sdk-starter-kit'

// Define the network types
export type Network = 'fuji' | 'mainnet' | 'anvil';
const chains = {
    fuji: avalancheFuji,
    mainnet: avalanche,
    anvil: anvil
};

// Create extended client type that includes public actions and network type
export type ExtendedWalletClient = WalletClient & PublicActions & { network: Network, safe?: SafeClient };
export type ExtendedPublicClient = PublicClient & { network: Network };
export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;

// Overloaded function to generate a client based on the network and optional private key
export async function generateClient(network: Network, privateKey: Hex, safe?: Hex): Promise<ExtendedWalletClient>;
export async function generateClient(network: Network, privateKey?: undefined): Promise<ExtendedPublicClient>;
export async function generateClient(network: Network): Promise<ExtendedPublicClient>;
export async function generateClient(network: Network, privateKey?: Hex, safe?: Hex): Promise<ExtendedWalletClient | ExtendedPublicClient> {
    return privateKey ? {
        ...createWalletClient({
            account: privateKeyToAccount(privateKey),
            chain: chains[network],
            transport: http()
        }).extend(publicActions),
        network,
        safe: safe ? await createSafeClient({
            provider: chains[network].rpcUrls.default.http[0],
            signer: privateKey,
            safeAddress: safe,
            txServiceUrl: 'https://api.safe.global/tx-service/avax/api',
            apiKey: process.env.SAFE_API_KEY
        }) : undefined
    } :
        {
            ...createPublicClient({
                chain: chains[network],
                transport: http()
            }).extend(publicActions),
            network
        };
}
