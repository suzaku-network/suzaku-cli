import { createWalletClient, http, WalletClient, createPublicClient, PublicClient } from 'viem'
import { avalancheFuji, avalanche, anvil } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'


function generateClient(privateKey: string, network: string): WalletClient {
    switch (network) {
        case 'fuji':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: avalancheFuji,
                transport: http()
            })
        case 'mainnet':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: avalanche,
                transport: http()
            })
        case 'anvil':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: anvil,
                transport: http()
            })
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
