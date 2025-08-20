import { TContract } from './config';
import type { Hex, Account } from 'viem';

export async function setUpSecurityModule(
  balancer: TContract['BalancerValidatorManager'],
  securityModule: Hex,
  maxWeight: bigint,
  account: Account | undefined
) {
  console.log("Setting up security module...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await balancer.write.setUpSecurityModule(
      [securityModule, maxWeight],
      { chain: null, account }
    );
    console.log("Security module updated, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function getSecurityModules(
  balancer: TContract['BalancerValidatorManager']
) {
  console.log("Getting security modules...");

  try {
    const modules = await balancer.read.getSecurityModules();
    console.log(modules);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function getSecurityModuleWeights(
  balancer: TContract['BalancerValidatorManager'],
  securityModule: Hex
) {
  console.log("Getting security module weights...");

  try {
    const val = await balancer.read.getSecurityModuleWeights(
      [securityModule]
    );
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}
