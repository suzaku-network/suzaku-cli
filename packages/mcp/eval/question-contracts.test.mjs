import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

const questions = readJson('./questions.json');
const contracts = readJson('./question-contracts.json');
const evidence = readJson('./evidence/dexalot-mainnet-2026-07-29.json');
const soul = readFileSync(new URL('../deploy/openclaw/SOUL.md', import.meta.url), 'utf8');

describe('eval question contracts', () => {
  it('has exactly one truth contract for every retained question', () => {
    const questionIds = questions.questions.map(({ id }) => id).sort();
    const contractIds = contracts.contracts.map(({ id }) => id).sort();
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(contractIds).toEqual(questionIds);
    expect(contracts.suiteVersion).toBe(questions.suiteVersion);
    expect(contracts.suiteStatus).toBe('draft');
  });

  it('makes the outcome, evidence, objective checks, and semantic judgment reviewable', () => {
    for (const contract of contracts.contracts) {
      expect(contract.userNeed, contract.id).toBeTypeOf('string');
      expect(contract.expectedOutcome, contract.id).toBeTypeOf('string');
      for (const key of ['required', 'prohibited', 'evidence', 'machineChecks', 'semanticCriteria', 'invalidWhen']) {
        expect(Array.isArray(contract[key]), `${contract.id}.${key}`).toBe(true);
        expect(contract[key].length, `${contract.id}.${key}`).toBeGreaterThan(0);
      }
      for (const item of contract.evidence) {
        expect(item.kind, `${contract.id}.evidence.kind`).toBeTypeOf('string');
        expect(item.ref, `${contract.id}.evidence.ref`).toBeTypeOf('string');
        expect(item.claim, `${contract.id}.evidence.claim`).toBeTypeOf('string');
      }
      if (contract.requiredGroundTruth) {
        const question = questions.questions.find(({ id }) => id === contract.id);
        const configured = new Set((question.groundTruth ?? []).map(({ tool }) => tool));
        for (const tool of contract.requiredGroundTruth) {
          expect(configured.has(tool), `${contract.id} missing ground truth ${tool}`).toBe(true);
        }
      }
    }
  });

  it('locks the two corrected protocol conclusions without phrase grading', () => {
    const rewards = contracts.contracts.find(({ id }) => id === 'can-set-rewards');
    expect(rewards.expectedOutcome).toContain('existing funding does not itself make the contract revert');
    expect(rewards.expectedOutcome).toContain('adds to the epoch total');
    expect(rewards.prohibited.join(' ')).toContain("already funded' alone");

    const slashing = contracts.contracts.find(({ id }) => id === 'slashing-cannot-confirm');
    expect(slashing.expectedOutcome).toContain('no initialized slasher');
    expect(slashing.expectedOutcome).toContain('unimplemented');
    expect(slashing.expectedOutcome.toLowerCase()).toContain('do not attribute');
    expect(soul.toLowerCase()).toContain('do not support slashing');
    expect(soul).not.toContain('never confirm or deny a slashing');
  });
});

describe('pinned Dexalot evidence', () => {
  it('identifies one registered vault with no initialized slasher', () => {
    expect(evidence.network.chainId).toBe(43114);
    expect(evidence.network.blockNumber).toBe(91_505_169);
    const read = (signature) => evidence.liveReads.find((item) => item.signature === signature);
    expect(read('getVaultCount()(uint256)').result).toBe('1');
    expect(read('isSlasherInitialized()(bool)').result).toBe(false);
    expect(read('slasher()(address)').result).toBe('0x0000000000000000000000000000000000000000');
    expect(read('slashVault()').decodedError).toBe('MiddlewareVaultManager__SlasherNotImplemented()');
  });

  it('pins the official accumulation implementation without claiming bytecode equivalence', () => {
    expect(evidence.sourcePin.commit).toMatch(/^[0-9a-f]{40}$/);
    const rewardsClaim = evidence.sourcePin.claims.find((item) => item.file.endsWith('RewardsNativeToken.sol'));
    expect(rewardsClaim.claim).toContain('epochRewards[targetEpoch] += epochAmount');
    expect(evidence.limitations.join(' ')).toContain('does not claim a byte-for-byte match');
  });
});
