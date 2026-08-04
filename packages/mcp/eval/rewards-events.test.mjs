import { describe, expect, it, vi } from 'vitest';
import { getRewardsAmountSetEvents } from '../../../dist/rewards.js';

const REWARDS = `0x${'1'.repeat(40)}`;
const MIDDLEWARE = `0x${'2'.repeat(40)}`;

function fixture() {
  const event = {
    blockNumber: 1n,
    transactionHash: `0x${'3'.repeat(64)}`,
    eventName: 'RewardsAmountSet',
    args: {
      startEpoch: 40n,
      numberOfEpochs: 20n,
      rewardsToken: `0x${'4'.repeat(40)}`,
      rewardsAmount: 100n,
    },
  };
  const client = {
    getBlockNumber: vi.fn(async () => 100n),
    getBlock: vi.fn(async ({ blockNumber } = {}) => ({
      number: blockNumber ?? 100n,
      timestamp: blockNumber ?? 100n,
    })),
    getContractEvents: vi.fn(async () => [event]),
  };
  const middleware = {
    read: {
      START_TIME: vi.fn(async () => 0n),
      getEpochStartTs: vi.fn(async () => { throw new Error('epoch lookback must not be used'); }),
    },
  };
  const rewards = {
    address: REWARDS,
    abi: [],
    read: { getEpochRewards: vi.fn(async () => 100n) },
  };
  const config = {
    client,
    contracts: { L1Middleware: vi.fn(async () => middleware) },
  };
  return { client, middleware, rewards, config };
}

describe('RewardsAmountSet history bounds', () => {
  it('scans from middleware START_TIME so an older covering event is retained', async () => {
    const { client, middleware, rewards, config } = fixture();

    const result = await getRewardsAmountSetEvents(rewards, config, 52, {
      middlewareAddress: MIDDLEWARE,
    });

    expect(middleware.read.START_TIME).toHaveBeenCalledOnce();
    expect(middleware.read.getEpochStartTs).not.toHaveBeenCalled();
    expect(result.eventCount).toBe(1);
    expect(client.getContractEvents).toHaveBeenCalledWith(expect.objectContaining({
      fromBlock: 0n,
      toBlock: 98n,
    }));
  });

  it('preserves an explicit inclusive block range exactly', async () => {
    const { client, rewards, config } = fixture();

    await getRewardsAmountSetEvents(rewards, config, 52, {
      fromBlock: 50n,
      toBlock: 60n,
    });

    expect(config.contracts.L1Middleware).not.toHaveBeenCalled();
    expect(client.getContractEvents).toHaveBeenCalledWith(expect.objectContaining({
      fromBlock: 50n,
      toBlock: 60n,
    }));
  });
});
