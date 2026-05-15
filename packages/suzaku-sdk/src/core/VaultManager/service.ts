import { type Address } from 'viem';
import type { ExtendedClient } from '../client/types';
import type { IReadContract } from '../client/contract';
import type { TVaultManagerABI } from './abi';
import type { TL1RegistryABI } from '../L1Registry/abi';
import type { TOperatorL1OptInServiceABI } from '../OperatorL1OptInService/abi';
import { getVaultTokenized } from '../VaultTokenized/abi';
import { getL1RestakeDelegator } from '../L1RestakeDelegator/abi';

export type OperatorStakeDetail = {
  vaultAddress: Address;
  l1Address: Address;
  collateral: Address;
  stakeValue: bigint;
};

export type OperatorStakesResult = {
  totalStakesByCollateral: Record<string, bigint>;
  details: OperatorStakeDetail[];
};

export async function getOperatorStakes(
  client: ExtendedClient,
  vaultManager: IReadContract<TVaultManagerABI, 'getVaultCount' | 'getVaultAtWithTimes' | 'getVaultCollateralClass'>,
  l1Registry: IReadContract<TL1RegistryABI, 'totalL1s' | 'getL1At'>,
  operatorL1OptInService: IReadContract<TOperatorL1OptInServiceABI, 'isOptedIn'>,
  operatorAddress: Address
): Promise<OperatorStakesResult> {
  const vaultCount = await vaultManager.read.getVaultCount();
  const totalL1s = await l1Registry.read.totalL1s();

  const l1Array: Address[] = [];
  for (let i = 0n; i < totalL1s; i++) {
    const [l1Address] = await l1Registry.read.getL1At([i]);
    l1Array.push(l1Address as Address);
  }

  const totalStakesByCollateral: Record<string, bigint> = {};
  const details: OperatorStakeDetail[] = [];

  for (let i = 0n; i < vaultCount; i++) {
    const [vaultAddress] = await vaultManager.read.getVaultAtWithTimes([i]);
    const collateralClass = await vaultManager.read.getVaultCollateralClass([vaultAddress]);

    const vaultTokenized = await getVaultTokenized(client, vaultAddress);
    const delegator = await vaultTokenized.read.delegator();

    if (delegator === '0x0000000000000000000000000000000000000000') continue;

    const l1RestakeDelegator = await getL1RestakeDelegator(client, delegator);
    const collateral = await vaultTokenized.read.collateral();

    for (const l1Address of l1Array) {
      const isOptedIn = await operatorL1OptInService.read.isOptedIn([operatorAddress, l1Address]);

      if (isOptedIn) {
        const stakeValue = await l1RestakeDelegator.read.stake([l1Address, collateralClass, operatorAddress]);

        if (stakeValue > 0n) {
          details.push({
            vaultAddress: vaultAddress as Address,
            l1Address: l1Address as Address,
            collateral: collateral as Address,
            stakeValue,
          });
          totalStakesByCollateral[collateral] = (totalStakesByCollateral[collateral] ?? 0n) + stakeValue;
        }
      }
    }
  }

  return { totalStakesByCollateral, details };
}
