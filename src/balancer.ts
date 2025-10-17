import { SafeSuzakuContract } from './lib/viemUtils';
import { type Hex, type Account } from 'viem';
import { logger } from './lib/logger';

export enum ValidatorStatus {
  Unknown,
  PendingAdded,
  Active,
  PendingRemoved,
  Completed,
  Invalidated,
  PendingStakeUpdated
}

export const ValidatorStatusNames = [
  "Unknown",
  "PendingAdded",
  "Active",
  "PendingRemoved",
  "Completed",
  "Invalidated",
  "PendingStakeUpdated"
];

export async function setUpSecurityModule(
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  securityModule: Hex,
  maxWeight: bigint,
  account: Account
) {
  logger.log("Setting up security module...");

  const hash = await balancer.safeWrite.setUpSecurityModule(
    [securityModule, maxWeight],
    { chain: null, account }
  );
  logger.log("Security module updated, tx hash:", hash);
}

export async function getSecurityModules(
  balancer: SafeSuzakuContract['BalancerValidatorManager']
) {
  logger.log("Getting security modules...");

  const modules = await balancer.read.getSecurityModules();
  logger.log(modules);
}

export async function getSecurityModuleWeights(
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  securityModule: Hex
) {
  logger.log("Getting security module weights...");

  const val = await balancer.read.getSecurityModuleWeights(
    [securityModule]
  );
  logger.log(val);
}
