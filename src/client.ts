import {
  generateClient as _generateClient,
  chainList,
  type ExtendedClient,
  type ExtendedWalletClient,
  type ExtendedPublicClient,
  type Network,
  type Chains,
  type Addresses,
  type PChainAddress,
} from '@suzaku-sdk/node';
import { type Hex } from 'viem';
import { configDotenv } from 'dotenv';
import path from 'path';

export type { Network, Chains, Addresses, PChainAddress, ExtendedClient, ExtendedWalletClient, ExtendedPublicClient };

export async function generateClient(chain: Chains, privateKey: Hex | 'ledger', safe?: Hex): Promise<ExtendedWalletClient>;
export async function generateClient(chain: Chains, privateKey?: undefined, safe?: Hex): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains): Promise<ExtendedPublicClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex): Promise<ExtendedClient>;
export async function generateClient(chain: Chains, privateKey?: Hex | 'ledger', safe?: Hex): Promise<ExtendedClient> {
  const envFileBase = path.resolve(__dirname, '..', 'defaults', '.env.');
  const network: Network = chainList[chain].testnet ? 'fuji' : 'mainnet';
  configDotenv({ path: envFileBase + network });
  if ((network as string) !== chain) configDotenv({ path: envFileBase + chain });
  return _generateClient(chain, privateKey as any, safe);
}
