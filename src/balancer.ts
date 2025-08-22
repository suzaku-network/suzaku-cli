import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

export async function setUpSecurityModule(
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  securityModule: Hex,
  maxWeight: bigint,
  account: Account
) {
  console.log("Setting up security module...");

    const hash = await balancer.safeWrite.setUpSecurityModule(
      [securityModule, maxWeight],
      { chain: null, account }
    );
    console.log("Security module updated, tx hash:", hash);
}

export async function getSecurityModules(
  balancer: SafeSuzakuContract['BalancerValidatorManager']
) {
  console.log("Getting security modules...");

    const modules = await balancer.read.getSecurityModules();
    console.log(modules);
}

export async function getSecurityModuleWeights(
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  securityModule: Hex
) {
  console.log("Getting security module weights...");

    const val = await balancer.read.getSecurityModuleWeights(
      [securityModule]
    );
    console.log(val);
}
