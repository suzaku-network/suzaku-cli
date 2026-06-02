import { Hex } from 'viem';
import { SuzakuContract } from './lib/viemUtils';
import { logger } from './lib/logger';

export async function vaultHelperInfo(
  vaultHelper: SuzakuContract['VaultHelper']
) {
  logger.log("Fetching VaultHelper information...");

  const [vaultFactory, lstWrapperFactory] = await vaultHelper.multicall([
    'VAULT_FACTORY',
    'LST_WRAPPER_FACTORY',
  ] as const);

  const info = {
    address: vaultHelper.address,
    vaultFactory: vaultFactory as Hex,
    lstWrapperFactory: lstWrapperFactory as Hex,
  };

  logger.logJsonTree(info);
  logger.addData('vaultHelperInfo', info);
  return info;
}

export async function vaultHelperGetUserPendingWithdraws(
  vaultHelper: SuzakuContract['VaultHelper'],
  vault: Hex,
  user: Hex
) {
  logger.log(`Reading pending withdrawals for ${user} in vault ${vault}...`);

  const withdrawals = await vaultHelper.read.getUserPendingWithdraws([vault, user]);
  logger.log("Pending withdrawals:", withdrawals);
  logger.addData('pendingWithdraws', withdrawals);
  return withdrawals;
}

export async function vaultHelperGetUserFuturePendingWithdraws(
  vaultHelper: SuzakuContract['VaultHelper'],
  vault: Hex,
  user: Hex
) {
  logger.log(`Reading future pending withdrawals for ${user} in vault ${vault}...`);

  const withdrawals = await vaultHelper.read.getUserFuturePendingWithdraws([vault, user]);
  logger.log("Future pending withdrawals:", withdrawals);
  logger.addData('futurePendingWithdraws', withdrawals);
  return withdrawals;
}

export async function vaultHelperGetUserPendingWithdrawsInRange(
  vaultHelper: SuzakuContract['VaultHelper'],
  vault: Hex,
  user: Hex,
  fromEpoch: bigint,
  toEpoch: bigint
) {
  logger.log(`Reading pending withdrawals for ${user} in vault ${vault} from epoch ${fromEpoch} to ${toEpoch}...`);

  const withdrawals = await vaultHelper.read.getUserPendingWithdrawsInRange([vault, user, fromEpoch, toEpoch]);
  logger.log("Pending withdrawals in range:", withdrawals);
  logger.addData('pendingWithdrawsInRange', withdrawals);
  return withdrawals;
}

export async function vaultHelperGetStakerClaimableReward(
  vaultHelper: SuzakuContract['VaultHelper'],
  staker: Hex,
  rewards: Hex,
  vault: Hex,
  rewardsToken: Hex
) {
  logger.log(`Reading claimable rewards for staker ${staker}...`);

  const claimable = await vaultHelper.read.getStakerClaimableReward([staker, rewards, vault, rewardsToken]);
  const result = { token: claimable.token as Hex, amount: claimable.amount.toString() };
  logger.logJsonTree(result);
  logger.addData('stakerClaimableReward', result);
  return claimable;
}

export async function vaultHelperGetStakerClaimableRewardInRange(
  vaultHelper: SuzakuContract['VaultHelper'],
  staker: Hex,
  rewards: Hex,
  vault: Hex,
  rewardsToken: Hex,
  fromEpoch: number,
  toEpoch: number
) {
  logger.log(`Reading claimable rewards for staker ${staker} from epoch ${fromEpoch} to ${toEpoch}...`);

  const claimable = await vaultHelper.read.getStakerClaimableRewardInRange([staker, rewards, vault, rewardsToken, fromEpoch, toEpoch]);
  const result = { token: claimable.token as Hex, amount: claimable.amount.toString() };
  logger.logJsonTree(result);
  logger.addData('stakerClaimableRewardInRange', result);
  return claimable;
}

export async function vaultHelperGetVaultLatestDistributedRewards(
  vaultHelper: SuzakuContract['VaultHelper'],
  vault: Hex,
  rewards: Hex
) {
  logger.log(`Reading latest distributed rewards for vault ${vault}...`);

  const amount = await vaultHelper.read.getVaultLatestDistributedRewards([vault, rewards]);
  logger.log("Latest distributed rewards:", amount.toString());
  logger.addData('vaultLatestDistributedRewards', amount.toString());
  return amount;
}
