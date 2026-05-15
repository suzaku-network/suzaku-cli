import { parseUnits, type Address, type Hex } from 'viem';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { IContract, IReadContract } from '../client/contract';
import type { TVaultTokenizedABI } from './abi';
import type { TL1MiddlewareABI } from '../L1Middleware/abi';
import { getDefaultCollateral } from '../DefaultCollateral/abi';
import { getERC20 } from '../ERC20/abi';
import { getL1RestakeDelegator } from '../L1RestakeDelegator/abi';

export type CollateralClassInfo = {
  class: number;
  l1Limit: number;
  totalOperatorShares: number;
};

export type VaultInfo = {
  address: Address;
  collateral: Address;
  collateralLimit: number;
  collateralAsset: Address;
  collateralAssetSymbol: string;
  decimals: number;
  delegator: Address;
  slasher: Address;
  totalStake: number;
  activeStake: number;
  epochDuration: number;
  currentEpoch: number;
  depositWhitelist: boolean;
  depositLimit?: number;
  collateralClasses?: CollateralClassInfo[];
};

export async function getVaultInfo(
  client: ExtendedClient,
  vault: IReadContract<TVaultTokenizedABI>,
  middleware?: IReadContract<TL1MiddlewareABI, 'getActiveCollateralClasses' | 'BALANCER'>
): Promise<VaultInfo> {
  const [
    collateralAddress,
    delegatorAddress,
    slasherAddress,
    totalStake,
    activeStake,
    epochDuration,
    currentEpoch,
    depositWhitelist,
    isDepositLimit,
  ] = await vault.multicall([
    'collateral',
    'delegator',
    'slasher',
    'totalStake',
    'activeStake',
    'epochDuration',
    'currentEpoch',
    'depositWhitelist',
    'isDepositLimit',
  ] as const);

  const [collateral, depositLimit] = await Promise.all([
    getDefaultCollateral(client, collateralAddress),
    isDepositLimit ? vault.read.depositLimit() : Promise.resolve(undefined),
  ]);

  const [collateralAsset, collateralLimit, decimals] = await collateral.multicall([
    'asset',
    'limit',
    'decimals',
  ] as const);

  const assetToken = await getERC20(client, collateralAsset);
  const collateralAssetSymbol = await assetToken.read.symbol();

  let collateralClasses: CollateralClassInfo[] | undefined;
  if (middleware) {
    const delegator = await getL1RestakeDelegator(client, delegatorAddress);
    const [[primary, secondaries], l1Address] = await middleware.multicall(['getActiveCollateralClasses', 'BALANCER'] as const);
    const allClasses = [primary, ...secondaries];

    collateralClasses = await Promise.all(
      allClasses.map(async (cls): Promise<CollateralClassInfo> => {
        const [l1Limit, totalOperatorShares] = await Promise.all([
          delegator.read.l1Limit([l1Address, cls]),
          delegator.read.totalOperatorL1Shares([l1Address, cls]),
        ]);
        return { class: Number(cls), l1Limit: Number(l1Limit), totalOperatorShares: Number(totalOperatorShares) };
      })
    );
  }

  return {
    address: vault.address,
    collateral: collateralAddress as Address,
    collateralLimit: Number(collateralLimit),
    collateralAsset: collateralAsset as Address,
    collateralAssetSymbol,
    decimals,
    delegator: delegatorAddress as Address,
    slasher: slasherAddress as Address,
    totalStake: Number(totalStake),
    activeStake: Number(activeStake),
    epochDuration: Number(epochDuration),
    currentEpoch: Number(currentEpoch),
    depositWhitelist,
    ...(depositLimit !== undefined && { depositLimit: Number(depositLimit) }),
    ...(collateralClasses && { collateralClasses }),
  };
}

export async function deposit(
  client: ExtendedWalletClient,
  vault: IContract<TVaultTokenizedABI, 'deposit' | 'collateral'>,
  onBehalfOf: Address,
  amount: string
): Promise<{ approveTxHash: Hex; depositTxHash: Hex }> {
  const collateralAddress = await vault.read.collateral();
  const collateral = await getDefaultCollateral(client, collateralAddress);
  const amountWei = parseUnits(amount, await collateral.read.decimals());
  const approveTxHash = await collateral.safeWrite.approve([vault.address, amountWei]);
  await client.waitForTransactionReceipt({ hash: approveTxHash });
  const depositTxHash = await vault.safeWrite.deposit([onBehalfOf, amountWei]);
  await client.waitForTransactionReceipt({ hash: depositTxHash });
  return { approveTxHash, depositTxHash };
}

export async function setDepositLimit(
  client: ExtendedWalletClient,
  vault: IContract<TVaultTokenizedABI, 'setIsDepositLimit' | 'setDepositLimit' | 'decimals' | 'isDepositLimit'>,
  limit: string
): Promise<Hex> {
  const limitWei = parseUnits(limit, await vault.read.decimals());
  const isLimitShouldBeEnabled = limitWei > 0n;
  const isLimitEnabled = await vault.read.isDepositLimit();
  if (isLimitShouldBeEnabled !== isLimitEnabled) {
    await vault.safeWrite.setIsDepositLimit([isLimitShouldBeEnabled], {
      chain: null,
      account: client.account!,
    });
  }
  return vault.safeWrite.setDepositLimit([limitWei], {
    chain: null,
    account: client.account!,
  });
}

export async function increaseCollateralLimit(
  client: ExtendedWalletClient,
  vault: IReadContract<TVaultTokenizedABI, 'collateral'>,
  limit: string
): Promise<Hex> {
  const collateralAddress = await vault.read.collateral();
  const collateral = await getDefaultCollateral(client, collateralAddress);
  const limitWei = parseUnits(limit, await collateral.read.decimals());
  return collateral.safeWrite.increaseLimit([limitWei], {
    chain: null,
    account: client.account!,
  });
}
