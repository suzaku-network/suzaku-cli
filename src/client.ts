import { avalancheFuji, avalanche, anvil } from 'viem/chains'
import { createWalletClient, http, WalletClient, createPublicClient, PublicClient, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { PublicActions } from 'viem'

// Create extended client type that includes public actions
export type ExtendedWalletClient = WalletClient & PublicActions;

function generateClient(privateKey: string, network: string): ExtendedWalletClient {
    switch (network) {
        case 'fuji':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: avalancheFuji,
                transport: http()
            }).extend(publicActions)
        case 'mainnet':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: avalanche,
                transport: http()
            }).extend(publicActions)
        case 'anvil':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: anvil,
                transport: http()
            }).extend(publicActions)
        default:
            throw new Error(`Unsupported network: ${network}`)
    }
}

function generatePublicClient(network: string): PublicClient {
    switch (network) {
        case 'fuji':
            return createPublicClient({
                chain: avalancheFuji,
                transport: http()
            })
        case 'mainnet':
            return createPublicClient({
                chain: avalanche,
                transport: http()
            })
        case 'anvil':
            return createPublicClient({
                chain: anvil,
                transport: http()
            })
        default:
            throw new Error(`Unsupported network: ${network}`)
    }
}

export { generateClient, generatePublicClient };
