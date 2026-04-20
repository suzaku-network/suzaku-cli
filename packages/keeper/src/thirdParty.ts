import { ExtendedWalletClient } from 'suzaku-cli/dist/client';
import { SafeSuzakuContract } from 'suzaku-cli/dist/lib/viemUtils';
import { logger } from 'suzaku-cli/dist/lib/logger';
import { claimDelegatorRewardsFor } from 'suzaku-cli/dist/kiteStaking';
import { Hex, parseAbiItem } from 'viem';

// 7-day lookback at ~2s block cadence — matches findRemovalTxHash in keeper.ts
const DEFAULT_LOOKBACK_BLOCKS = 302400n;

const INITIATED_DELEGATOR_REGISTRATION = parseAbiItem(
    'event InitiatedDelegatorRegistration(bytes32 indexed delegationID, bytes32 indexed validationID, address indexed delegatorAddress, uint64 nonce, uint64 validatorWeight, uint64 delegatorWeight, bytes32 setWeightMessageID, address rewardRecipient, uint256 stakeAmount)'
);

export interface CrystallizeResult {
    scanned: number;
    crystallized: number;
    errors: number;
    toBlock: bigint;
}

// For each vault-owned validator, find third-party delegations (delegator != vault)
// and call claimDelegatorRewardsFor on the SM so the validator's commission is
// credited into _redeemableValidatorRewards ahead of the vault's next harvest().
// Best-effort: reverts are swallowed (delegation may have been removed, no reward accrued).
export async function crystallizeThirdPartyCommissions(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    options: { lookbackBlocks?: bigint } = {}
): Promise<CrystallizeResult> {
    const lookback = options.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
    const vaultAddress = stakingVault.address.toLowerCase();
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > lookback ? currentBlock - lookback : 0n;

    const operators = await stakingVault.read.getOperatorList();
    const validationIDs: Hex[] = [];
    for (const op of operators) {
        const ids = await stakingVault.read.getOperatorValidators([op]);
        for (const id of ids) validationIDs.push(id as Hex);
    }

    if (validationIDs.length === 0) {
        return { scanned: 0, crystallized: 0, errors: 0, toBlock: currentBlock };
    }

    let logs: Array<{ args: { delegationID?: Hex; validationID?: Hex; delegatorAddress?: Hex } }> = [];
    try {
        logs = await client.getLogs({
            address: kiteStakingManager.address,
            event: INITIATED_DELEGATOR_REGISTRATION,
            args: { validationID: validationIDs },
            fromBlock,
            toBlock: 'latest',
        }) as any;
    } catch (error: any) {
        logger.warn(`crystallize: log scan failed: ${error.message || error}`);
        return { scanned: 0, crystallized: 0, errors: 1, toBlock: currentBlock };
    }

    const candidates = new Set<Hex>();
    for (const log of logs) {
        const delegator = log.args.delegatorAddress?.toLowerCase();
        const delegationID = log.args.delegationID;
        if (!delegator || !delegationID) continue;
        if (delegator === vaultAddress) continue;
        candidates.add(delegationID);
    }

    let crystallized = 0;
    let errors = 0;
    for (const delegationID of candidates) {
        try {
            await claimDelegatorRewardsFor(kiteStakingManager, delegationID, false, 0);
            crystallized++;
        } catch (error: any) {
            errors++;
            logger.debug(`crystallize: claim failed for ${delegationID}: ${error.message || error}`);
        }
    }

    return { scanned: candidates.size, crystallized, errors, toBlock: currentBlock };
}
