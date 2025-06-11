import { TContract } from './config';
import type { Hex, Account } from 'viem';

export async function setL1Limit(
  delegator: TContract['L1RestakeDelegator'],
  l1Address: Hex,
  assetClass: bigint,
  limit: bigint,
  account: Account | undefined
) {
  console.log("Setting L1 limit...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await delegator.write.setL1Limit(
      [l1Address, assetClass, limit],
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
  delegator: TContract['L1RestakeDelegator'],
  l1Address: Hex,
  assetClass: bigint,
  operatorAddress: Hex,
  shares: bigint,
  account: Account | undefined
) {
  console.log("Setting operator L1 shares...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await delegator.write.setOperatorL1Shares(
      [l1Address, assetClass, operatorAddress, shares],
      { chain: null, account }
    );
    console.log("setOperatorL1Shares done, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}
