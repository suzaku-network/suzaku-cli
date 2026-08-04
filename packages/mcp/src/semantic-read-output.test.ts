import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const requireRoot = createRequire(import.meta.url);
const {
  getGeneralInfo,
  getFeesInfo,
  getOperatorsInfo,
  getValidatorsInfo,
  getDelegatorsInfo,
  getWithdrawalsInfo,
  getEpochInfo,
  getFullInfo,
} = requireRoot('../../../dist/stakingVault.js') as typeof import('../../../dist/stakingVault.js');
const {
  getKiteStakingManagerInfo,
  getValidatorFullInfo,
  getDelegatorFullInfo,
} = requireRoot('../../../dist/kiteStaking.js') as typeof import('../../../dist/kiteStaking.js');
const { getSecurityModuleWeights } = requireRoot('../../../dist/balancer.js') as typeof import('../../../dist/balancer.js');
const { formatValidationUptimeMessageResult } = requireRoot('../../../dist/uptime.js') as typeof import('../../../dist/uptime.js');
const { logger } = requireRoot('../../../dist/lib/logger.js') as typeof import('../../../dist/lib/logger.js');

const OPERATOR = `0x${'1'.repeat(40)}`;
const RECIPIENT = `0x${'2'.repeat(40)}`;
const ID = `0x${'3'.repeat(64)}`;

function jsonSafe(value: unknown) {
  expect(() => JSON.stringify(value)).not.toThrow();
  expect(value).toEqual(expect.objectContaining({}));
}

function fakeStakingVault() {
  const values: Record<string, unknown> = {
    getTotalPooledStake: 1_000n,
    totalSupply: 900n,
    getExchangeRate: 1_111n,
    getAvailableStake: 100n,
    getTotalValidatorStake: 700n,
    getTotalDelegatedStake: 200n,
    getPendingWithdrawals: 30n,
    getClaimableWithdrawalStake: 20n,
    getInFlightExitingAmount: 10n,
    getCurrentEpoch: 52n,
    getLastEpochProcessed: 51n,
    decimals: 18,
    symbol: 'sKITE',
    owner: OPERATOR,
    paused: false,
    getProtocolFeeBips: 100n,
    getProtocolFeeRecipient: RECIPIENT,
    getPendingProtocolFees: 5n,
    getOperatorFeeBips: 200n,
    getTotalAccruedOperatorFees: 6n,
    getLiquidityBufferBips: 300n,
    getOperatorList: [OPERATOR],
    getMaxOperators: 10n,
    getMaxValidatorsPerOperator: 5n,
    getMaximumValidatorStake: 800n,
    getMaximumDelegatorStake: 300n,
    getWithdrawalQueueLength: 4n,
    getQueueHead: 1n,
    getTotalExitDebt: 7n,
    getEpochDuration: 604_800n,
    getMinimumStakeDuration: 86_400n,
  };

  const query = (call: string | { name: string }) => {
    const name = typeof call === 'string' ? call : call.name;
    if (name === 'getOperatorInfo') return { active: true, allocationBips: 10_000n, activeStake: 700n, accruedFees: 4n, feeRecipient: RECIPIENT };
    if (name === 'getOperatorExitDebt') return 7n;
    if (name === 'getOperatorValidators') return [ID];
    if (name === 'getOperatorDelegators') return [ID];
    if (name === 'getValidatorStakeAmount') return 700n;
    if (name === 'isValidatorPendingRemoval') return false;
    if (name === 'getDelegatorInfo') return { validationID: ID, isVaultOwnedValidator: true, operator: OPERATOR };
    return values[name];
  };

  return {
    address: RECIPIENT,
    multicall: async (calls: Array<string | { name: string }>) => calls.map(query),
  } as never;
}

describe('StakingVault MCP read payloads', () => {
  const client = { getBalance: async () => 42n } as never;

  it('returns semantic JSON for every advertised info section', async () => {
    const vault = fakeStakingVault();
    const outputs = [
      await getGeneralInfo(vault, client),
      await getFeesInfo(vault),
      await getOperatorsInfo(vault),
      await getValidatorsInfo(vault),
      await getDelegatorsInfo(vault),
      await getWithdrawalsInfo(vault),
      await getEpochInfo(vault),
      await getFullInfo(vault, client),
    ];

    outputs.forEach(jsonSafe);
    expect(outputs[0]).toMatchObject({ totalPooledStake: '1000', contractBalance: '42' });
    expect(outputs[2]).toMatchObject({ registeredOperators: 1, totalAllocationBips: '10000' });
    expect(outputs[3]).toMatchObject({ totalValidators: 1, validators: [{ stakeAmount: '700' }] });
    expect(outputs[4]).toMatchObject({ totalDelegations: 1 });
    expect(outputs[6]).toMatchObject({ currentEpoch: '52', epochsBehind: '1' });
    expect(outputs[7]).toMatchObject({ general: { totalPooledStake: '1000' }, epoch: { currentEpoch: '52' } });
  });
});

describe('Kite and Balancer MCP read payloads', () => {
  beforeEach(() => {
    logger.clearData();
    logger.setJsonMode(true);
  });

  afterEach(() => {
    logger.clearData();
    logger.setJsonMode(false);
  });

  it('returns exact string values from all three Kite aggregate reads', async () => {
    const kite = {
      read: {
        getStakingConfig: async () => [1_000_000_000n, 2_000_000_000n, 3_600n, 100, 5, 1n],
        getStakingManagerSettings: async () => ({ manager: OPERATOR, uptimeBlockchainID: ID }),
        getRewardCalculator: async () => RECIPIENT,
        getRewardVault: async () => RECIPIENT,
        owner: async () => OPERATOR,
        pendingOwner: async () => RECIPIENT,
        BIPS_CONVERSION_FACTOR: async () => 10_000n,
        MAXIMUM_DELEGATION_FEE_BIPS: async () => 2_000n,
        MAXIMUM_STAKE_MULTIPLIER_LIMIT: async () => 5n,
        getStakingValidator: async () => ({
          owner: OPERATOR, delegationFeeBips: 100, minStakeDuration: 3_600n,
          uptimeSeconds: 10n, lastRewardClaimTime: 20n, lastClaimUptimeSeconds: 5n,
        }),
        getValidatorPendingRewards: async () => [1n, 2n, 3n],
        getValidatorRewardInfo: async () => [RECIPIENT, 4n],
        getDelegatorInfo: async () => ({
          status: 1, owner: OPERATOR, validationID: ID, weight: 9n, startTime: 10n,
          startingNonce: 11n, endingNonce: 12n, lastRewardClaimTime: 13n, lastClaimUptimeSeconds: 14n,
        }),
        getDelegatorPendingRewards: async () => [5n, 2n, 3n],
        getDelegatorRewardInfo: async () => [RECIPIENT, 6n],
      },
    } as never;

    const info = await getKiteStakingManagerInfo(kite);
    const validator = await getValidatorFullInfo(kite, ID as `0x${string}`);
    const delegator = await getDelegatorFullInfo(kite, ID as `0x${string}`);

    [info, validator, delegator].forEach(jsonSafe);
    expect(info.BIPS_CONVERSION_FACTOR).toBe('10000');
    expect(validator.totalPendingReward).toBe('3');
    expect(delegator.weight).toBe('9');
  });

  it('serializes Balancer weights without bigint rounding', async () => {
    const weight = 9_007_199_254_740_993n;
    await getSecurityModuleWeights({ read: { getSecurityModuleWeights: async () => [weight, weight + 1n] } } as never, OPERATOR as `0x${string}`);

    expect(logger.getData().securityModuleWeights).toEqual({
      securityModule: OPERATOR,
      weight: '9007199254740993',
      maxWeight: '9007199254740994',
    });
  });

  it('builds a semantic uptime-message payload', () => {
    expect(formatValidationUptimeMessageResult('NodeID-test', 'chain-test', '0xsigned')).toEqual({
      nodeId: 'NodeID-test',
      blockchainId: 'chain-test',
      signedMessage: '0xsigned',
    });
  });
});
