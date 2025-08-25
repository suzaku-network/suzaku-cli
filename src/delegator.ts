import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

export async function setL1Limit(
  delegator: SafeSuzakuContract['L1RestakeDelegator'],
  l1Address: Hex,
  collateralClass: bigint,
  limit: bigint,
  account: Account | undefined
) {
  console.log("Setting L1 limit...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await delegator.safeWrite.setL1Limit(
      [l1Address, collateralClass, limit],
      { chain: null, account }
    );
    console.log("setL1Limit done, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function setOperatorL1Shares(
  delegator: SafeSuzakuContract['L1RestakeDelegator'],
  l1Address: Hex,
  collateralClass: bigint,
  operatorAddress: Hex,
  shares: bigint,
  account: Account | undefined
) {
  console.log("Setting operator L1 shares...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await delegator.safeWrite.setOperatorL1Shares(
      [l1Address, collateralClass, operatorAddress, shares],
      { chain: null, account }
    );
    console.log("setOperatorL1Shares done, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}
