import { avalancheFuji, avalanche, anvil } from 'viem/chains'
import { createWalletClient, http, WalletClient, createPublicClient, PublicClient, publicActions, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { PublicActions } from 'viem'

// Define the network types
export type Network = 'fuji' | 'mainnet' | 'anvil';
const chains = {
    fuji: avalancheFuji,
    mainnet: avalanche,
    anvil: anvil
};

// Create extended client type that includes public actions and network type
export type ExtendedWalletClient = WalletClient & PublicActions & { network: Network };
export type ExtendedPublicClient = PublicClient & { network: Network };

// Overloaded function to generate a client based on the network and optional private key
export function generateClient(network: Network, privateKey: Hex): ExtendedWalletClient;
export function generateClient(network: Network, privateKey?: undefined): ExtendedPublicClient;
export function generateClient(network: Network): ExtendedPublicClient;
export function generateClient(network: Network, privateKey?: Hex): ExtendedWalletClient | ExtendedPublicClient {
    return privateKey ? {
        ...createWalletClient({
            account: privateKeyToAccount(privateKey),
            chain: chains[network],
            transport: http()
        }).extend(publicActions),
        network
    } :
        {
            ...createPublicClient({
                chain: chains[network],
                transport: http()
            }).extend(publicActions),
            network
        };
}
