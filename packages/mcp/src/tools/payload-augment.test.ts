import { describe, it, expect } from 'vitest';
import {
  augmentEpochStatus,
  augmentFeesConfig,
  augmentLastClaimed,
  augmentLstInfo,
} from './payload-augment.js';

describe('augmentEpochStatus', () => {
  it('adds human epoch rewards and a human-note when the epoch status table is present', () => {
    const result = augmentEpochStatus({
      epochStatusTable: {
        epochs: [
          { epoch: 1, epochRewards: '1000000000000000000', funded: true },
        ],
      },
    }) as unknown as {
      epochStatusTable: {
        epochs: Array<Record<string, unknown>>;
        humanNote: string;
      };
    };

    expect(result.epochStatusTable.epochs[0].epochRewardsHuman).toBe('1');
    expect(result.epochStatusTable.humanNote).toBe('human values assume 18 decimals');
  });

  it('returns the original value when the epoch status table shape is absent', () => {
    const input = { epochRewards: '1000000000000000000' };

    expect(augmentEpochStatus(input)).toBe(input);
  });

  it('keeps the original epochRewards string on the input and augmented row', () => {
    const row = { epoch: 2, epochRewards: '35120550000000000000000' };
    const input = { epochStatusTable: { epochs: [row] } };
    const result = augmentEpochStatus(input) as {
      epochStatusTable: { epochs: Array<Record<string, unknown>> };
    };

    expect(row.epochRewards).toBe('35120550000000000000000');
    expect(result.epochStatusTable.epochs[0].epochRewards).toBe('35120550000000000000000');
    expect(result.epochStatusTable.epochs[0].epochRewardsHuman).toBe('35,120.55');
  });
});

describe('augmentFeesConfig', () => {
  it('adds percent strings and fee unit metadata for basis-point fields', () => {
    const result = augmentFeesConfig({
      feesConfig: {
        protocolFee: 500,
        operatorFee: 125,
        curatorFee: 0,
      },
    }) as { feesConfig: Record<string, unknown> };

    expect(result.feesConfig.protocolFeePercent).toBe('5.00%');
    expect(result.feesConfig.operatorFeePercent).toBe('1.25%');
    expect(result.feesConfig.curatorFeePercent).toBe('0.00%');
    expect(result.feesConfig.feeUnit).toBe('bps');
    expect(result.feesConfig.feeUnitNote).toBe('10000 bps = 100%');
  });

  it('returns the original value when feesConfig is absent', () => {
    const input = { protocolFee: 500 };

    expect(augmentFeesConfig(input)).toBe(input);
  });
});

describe('augmentLastClaimed', () => {
  it('marks string zero as never claimed with an explanatory note', () => {
    const result = augmentLastClaimed({ lastClaimedEpoch: '0' }) as Record<string, unknown>;

    expect(result.neverClaimed).toBe(true);
    expect(result.lastClaimedNote).toBe('0 means no claim recorded');
  });

  it('marks numeric zero as never claimed', () => {
    const result = augmentLastClaimed({ lastClaimedEpoch: 0 }) as Record<string, unknown>;

    expect(result.neverClaimed).toBe(true);
  });

  it('returns the original value when lastClaimedEpoch is absent or non-zero', () => {
    const absent = { account: '0xabc' };
    const nonZero = { lastClaimedEpoch: '12' };

    expect(augmentLastClaimed(absent)).toBe(absent);
    expect(augmentLastClaimed(nonZero)).toBe(nonZero);
  });
});

describe('augmentLstInfo', () => {
  it('adds human totals and exchange rate metadata when lstWrapperInfo is present', () => {
    const result = augmentLstInfo({
      lstWrapperInfo: {
        totalAssets: '1001500000000000000',
        totalSupply: '1000000000000000000',
      },
    }) as { lstWrapperInfo: Record<string, unknown> };

    expect(result.lstWrapperInfo.totalAssetsHuman).toBe('1');
    expect(result.lstWrapperInfo.totalSupplyHuman).toBe('1');
    expect(result.lstWrapperInfo.rate).toBe('1.0015');
    expect(result.lstWrapperInfo.rateNote).toBe('assets per share, 4dp');
  });

  it('returns the original value when lstWrapperInfo is absent', () => {
    const input = { totalAssets: '1001500000000000000' };

    expect(augmentLstInfo(input)).toBe(input);
  });
});
