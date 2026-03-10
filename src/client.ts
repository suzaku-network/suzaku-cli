import { WalletClient, PublicClient, PublicActions, Hex } from 'viem'
import { Account } from 'viem/accounts'
import { type SafeClient } from '@safe-global/sdk-starter-kit'
import { chainList } from './lib/chainList';
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

import { createWalletClient, custom, http, createPublicClient, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddresses } from './lib/utils';
import { getCoreWalletAccount } from './lib/coreWalletUtils';

// Web-safe client generator for Next.js fronts
export async function generateWebClient(chain: Chains, providerType: 'core' | 'injected' | Hex = 'core'): Promise<ExtendedWalletClient | ExtendedPublicClient> {
    const network = chainList[chain].testnet ? 'fuji' : 'mainnet';
    let account: ExtendedAccount | undefined;

    if (providerType === 'core') {
        account = await getCoreWalletAccount(network);
    } else if (providerType !== 'injected' && typeof providerType === 'string') {
        // Hex private key
        account = privateKeyToAccount(providerType) as ExtendedAccount;
        const addresses = getAddresses(providerType, network);
        account.address = addresses.C;
        account.pChainAddress = addresses.P;
    }

    if (account) {
        // We use window.avalanche for core, window.ethereum for standard injected
        const transportProvider = providerType === 'core'
            ? (window as any).avalanche
            : (providerType === 'injected' ? (window as any).ethereum : http());

        const client = createWalletClient({
            account,
            chain: chainList[chain],
            transport: custom(transportProvider)
        }).extend(publicActions);

        return {
            ...client,
            network,
            ledger: false, // Ledger is handled via CLI/Node HID, not web directly here
            safe: undefined, // Safe uses Node.js api kits, ignored in pure frontend client
            addresses: { C: account.address as Hex, P: account.pChainAddress }
        } as ExtendedWalletClient;
    }

    return {
        ...createPublicClient({
            chain: chainList[chain],
            transport: http()
        }).extend(publicActions),
        network
    } as ExtendedPublicClient;
}
