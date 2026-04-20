import type { Hex } from 'viem';
import type {
  AvalancheWalletClient,
  AvalancheClient,
  PChainActions,
  CChainActions,
} from '@avalanche-sdk/client';
import type { chainList } from './chainList';

export type Network = 'fuji' | 'mainnet' | 'anvil';
export type Chains = keyof typeof chainList;
export type PChainAddress = `P-${string}`;
export type Addresses = { P: PChainAddress; C: Hex };

export type ExtendedWalletClient = AvalancheWalletClient & {
  network: Network;
  addresses: Addresses;
  pChain: PChainActions;
  cChain: CChainActions;
};

export type ExtendedPublicClient = AvalancheClient & {
  network: Network;
  pChain: PChainActions;
  cChain: CChainActions;
};

export type ExtendedClient = ExtendedWalletClient | ExtendedPublicClient;
