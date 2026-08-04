import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import {
  findPChainValidator,
  formatPChainBalance,
  formatPChainBalanceFields,
  operatorStakeArgs,
} from '../../../dist/lib/accountInfo.js';
import { runAlertChecks, type AlertCheckInput } from './tools/heartbeat.js';

const requireRoot = createRequire(import.meta.url);
const { getVaultTotalSupply, getVaultTotalSupplyAtEpoch } = requireRoot('../../../dist/vault.js') as typeof import('../../../dist/vault.js');
const { logger } = requireRoot('../../../dist/lib/logger.js') as typeof import('../../../dist/lib/logger.js');

const ACCOUNT = `0x${'1'.repeat(40)}` as const;
const NODE_HEX = `0x${'0'.repeat(24)}${'2'.repeat(40)}` as const;

describe('middleware account read correctness', () => {
  it('orders getOperatorStake arguments as operator, epoch, collateral class', () => {
    expect(operatorStakeArgs(ACCOUNT, 52, 1n)).toEqual([ACCOUNT, 52, 1n]);
  });

  it('matches the P-Chain NodeID after converting the contract bytes32 value', () => {
    const expected = findPChainValidator(NODE_HEX, [
      { nodeID: 'NodeID-not-it', balance: 1 },
      { nodeID: 'NodeID-47Us9aEq2PvBC5wobBJw1yEpQEbMdm54p', balance: 2_400_000_000 },
    ]);
    expect(expected?.balance).toBe(2_400_000_000);
  });

  it('keeps nAVAX in its original unit and represents a missing balance as unknown', () => {
    expect(formatPChainBalance(2_400_000_000)).toEqual({
      balanceKnown: true,
      balanceNAvax: '2400000000',
      balanceAVAX: '2.4',
      continuousAVAXBalance: '2400000000',
    });
    expect(formatPChainBalance(undefined)).toEqual({
      balanceKnown: false,
      balanceNAvax: null,
      balanceAVAX: null,
      continuousAVAXBalance: null,
    });
    expect(formatPChainBalanceFields(undefined)).toEqual({
      balanceKnown: false,
      balanceNAvax: null,
      balanceAVAX: null,
    });
  });
});

describe('heartbeat balance alerts', () => {
  const input = (balanceAVAX: string | null, balanceKnown: boolean): AlertCheckInput => ({
    timing: { currentEpoch: 52, currentEpochStartTs: 1_000, epochDuration: 100, updateWindow: 50 },
    constants: { fundingDeadlineOffset: 4, distributionEarliestOffset: 2, claimGracePeriodEpochs: 1 },
    allClassesCached: true,
    claimability: [],
    uptimeSetByOperator: {},
    lstPaused: false,
    validatorBalances: [{ nodeID: 'NodeID-x', balanceAVAX, balanceKnown }],
    stuckTwoPhase: [],
    thresholds: { pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 },
    now: 1_010,
  });

  it('does not turn an unknown balance into a low-balance alert', () => {
    expect(runAlertChecks(input(null, false)).some((check) => check.name === 'pchain_balance_low')).toBe(false);
  });

  it('still alerts for an explicit zero balance', () => {
    expect(runAlertChecks(input('0', true)).find((check) => check.name === 'pchain_balance_low')?.status).toBe('alert');
  });
});

describe('vault supply JSON', () => {
  it('uses distinct current and historical keys and records the requested epoch', async () => {
    logger.clearData();
    logger.setJsonMode(true);
    await getVaultTotalSupply({ read: { totalSupply: async () => 123n } } as never);
    expect(logger.getData()).toEqual({ totalSupply: '123' });

    logger.clearData();
    await getVaultTotalSupplyAtEpoch({
      multicall: async () => [10, 100],
      read: { activeSharesAt: async () => 456n },
    } as never, 7n);
    expect(logger.getData()).toEqual({ totalSupplyAtEpoch: { epoch: '7', totalSupply: '456' } });

    logger.clearData();
    logger.setJsonMode(false);
  });
});
