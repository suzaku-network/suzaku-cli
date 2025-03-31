import { createWalletClient, http, WalletClient } from 'viem'
import { avalancheFuji, avalanche, localhost } from 'viem/chains'
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
        case 'localhost':
            return createWalletClient({
                account: privateKeyToAccount(privateKey as `0x${string}`),
                chain: localhost,
                transport: http()
            })
        default:
            throw new Error(`Unsupported network: ${network}`)
    }
}

export { generateClient };
