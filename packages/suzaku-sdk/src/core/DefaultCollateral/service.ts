import { parseUnits, type Address, type Hex } from 'viem';
import type { ExtendedWalletClient } from '../client/types';
import type { IContract } from '../client/contract';
import type { TDefaultCollateralABI } from './abi';
import { getERC20 } from '../ERC20/abi';

export async function depositToCollateral(
  client: ExtendedWalletClient,
  collateral: IContract<TDefaultCollateralABI, 'deposit' | 'asset' | 'decimals'>,
  recipient: Address,
  amount: string
): Promise<{ approveTxHash: Hex; depositTxHash: Hex }> {
  const rewardTokenAddress = await collateral.read.asset();
  const rewardToken = await getERC20(client, rewardTokenAddress);
  const amountWei = parseUnits(amount, await collateral.read.decimals());
  const approveTxHash = await rewardToken.safeWrite.approve([collateral.address, amountWei]);
  await client.waitForTransactionReceipt({ hash: approveTxHash });
  const depositTxHash = await collateral.safeWrite.deposit([recipient, amountWei]);
  await client.waitForTransactionReceipt({ hash: depositTxHash });
  return { approveTxHash, depositTxHash };
}
