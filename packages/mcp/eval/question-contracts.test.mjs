import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scoreTrace } from './scoring.mjs';

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

const questions = readJson('./questions.json');
const contracts = readJson('./question-contracts.json');
const evidence = readJson('./evidence/dexalot-mainnet-2026-07-29.json');
const soul = readFileSync(new URL('../deploy/openclaw/SOUL.md', import.meta.url), 'utf8');
const epochs = readFileSync(new URL('../deploy/openclaw/EPOCHS.md', import.meta.url), 'utf8');

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

  it('keeps every evidence reference attached to an existing question or source anchor', () => {
    const questionIds = new Set(questions.questions.map(({ id }) => id));
    const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    for (const contract of contracts.contracts) {
      for (const item of contract.evidence) {
        const [relativePath, fragment] = item.ref.split('#', 2);
        if (item.kind === 'live-mcp') {
          expect(relativePath, `${contract.id}: ${item.ref}`).toBe('questions.json');
          expect(questionIds.has(fragment), `${contract.id}: ${item.ref}`).toBe(true);
          continue;
        }

        const target = new URL(relativePath, import.meta.url);
        expect(existsSync(target), `${contract.id}: ${item.ref}`).toBe(true);
        if (fragment) {
          const source = readFileSync(target, 'utf8');
          expect(
            source.includes(fragment) || normalize(source).includes(normalize(fragment)),
            `${contract.id}: dead evidence anchor ${item.ref}`,
          ).toBe(true);
        }
      }
    }
  });

  it('locks the two corrected protocol conclusions without phrase grading', () => {
    const rewards = contracts.contracts.find(({ id }) => id === 'can-set-rewards');
    expect(rewards.expectedOutcome).toContain('existing funding does not itself make the contract revert');
    expect(rewards.expectedOutcome).toContain('adds to the epoch total');
    expect(rewards.expectedOutcome).toContain('read-only monitor');
    expect(JSON.stringify(rewards)).not.toContain('rewards_set_amount_propose');
    expect(rewards.prohibited.join(' ')).toContain("already funded' alone");

    const slashing = contracts.contracts.find(({ id }) => id === 'slashing-cannot-confirm');
    expect(slashing.expectedOutcome).toContain('no initialized slasher');
    expect(slashing.expectedOutcome).toContain('unimplemented');
    expect(slashing.expectedOutcome.toLowerCase()).toContain('do not attribute');
    expect(soul.toLowerCase()).toContain('do not support slashing');
    expect(soul).not.toContain('never confirm or deny a slashing');
  });

  it('routes weekly work through the composite heartbeat and accepts a covering status range', () => {
    const weekly = questions.questions.find(({ id }) => id === 'weekly-todo');
    const alternatives = weekly.expectedToolCalls.flat();
    expect(alternatives).toContainEqual(expect.objectContaining({
      tool: 'deployment_heartbeat',
    }));
    expect(alternatives).toContainEqual(expect.objectContaining({
      tool: 'rewards_get_epoch_status',
      argsSubset: expect.objectContaining({
        epoch: '{{currentEpoch-4}}',
        toEpoch: '{{currentEpoch}}',
      }),
    }));

    const route = epochs.split('\n').find((line) => line.includes('What do I need to do this week?'));
    expect(route).toContain('deployment_heartbeat');
    expect(route).toContain('uptime.status');
    expect(route).toContain('timing fields');
    expect(route).not.toContain('middleware_epoch_status');
    expect(epochs).toContain('Never infer missing');
    expect(soul).toContain('rather than calculating or guessing');
  });

  it('accepts equivalent read paths observed in the Kimi pilot without weakening scope checks', () => {
    const byId = (id) => questions.questions.find((question) => question.id === id);
    const scores = (id, trace) => scoreTrace(trace, {
      expectedToolCalls: byId(id).expectedToolCalls,
      maxToolCalls: byId(id).maxToolCalls,
    }).ok;

    expect(scores('deployment-state', [{
      name: 'deployment_heartbeat',
      args: {
        middlewareAddress: '{{middleware}}',
        rewardsAddress: '{{rewards}}',
        mode: 'digest',
        network: 'mainnet',
      },
    }])).toBe(true);

    expect(scores('future-epoch-not-started', [{
      name: 'rewards_epoch_diagnosis',
      args: {
        rewardsAddress: '{{rewards}}',
        epoch: '{{currentEpoch+2}}',
        network: 'mainnet',
      },
    }])).toBe(true);

    expect(scores('network-scope-fuji-no-mainnet-leak', [{
      name: 'l1_registry_get_all',
      args: { network: 'fuji' },
    }])).toBe(true);

    expect(scores('deployment-state', [{
      name: 'deployment_heartbeat',
      args: {
        middlewareAddress: '{{middleware}}',
        rewardsAddress: '{{rewards}}',
        mode: 'digest',
        network: 'fuji',
      },
    }])).toBe(false);
    expect(scores('future-epoch-not-started', [{
      name: 'rewards_epoch_diagnosis',
      args: {
        rewardsAddress: '{{rewards}}',
        epoch: '{{currentEpoch+1}}',
        network: 'mainnet',
      },
    }])).toBe(false);
    expect(scores('network-scope-fuji-no-mainnet-leak', [{
      name: 'l1_registry_get_all',
      args: { network: 'mainnet' },
    }])).toBe(false);
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
