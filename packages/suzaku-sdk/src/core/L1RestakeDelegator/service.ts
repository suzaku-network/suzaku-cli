import { parseUnits, type Address, type Hex } from 'viem';
import type { ExtendedWalletClient } from '../client/types';
import type { IReadContract } from '../client/contract';
import type { TVaultTokenizedABI } from '../VaultTokenized/abi';
import { getL1RestakeDelegator } from './abi';

export async function setL1Limit(
  client: ExtendedWalletClient,
  vault: IReadContract<TVaultTokenizedABI, 'delegator' | 'decimals'>,
  l1Address: Address,
  collateralClass: bigint,
  limit: string
): Promise<Hex> {
  const delegatorAddress = await vault.read.delegator();
  const delegator = await getL1RestakeDelegator(client, delegatorAddress);
  const limitWei = parseUnits(limit, await vault.read.decimals());
  return delegator.safeWrite.setL1Limit([l1Address, collateralClass, limitWei]);
}
