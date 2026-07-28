export function createSpendGuard(maxCostUsd) {
  let spentUsd = 0;

  return {
    get spentUsd() {
      return spentUsd;
    },

    beforeCall(engine) {
      if (engine !== 'anthropic') return null;
      if (!Number.isFinite(maxCostUsd)) {
        return 'metered run has no valid --max-cost-usd ceiling';
      }
      if (spentUsd >= maxCostUsd) {
        return `paid-run ceiling reached before call ($${spentUsd.toFixed(6)} of $${maxCostUsd.toFixed(6)})`;
      }
      return null;
    },

    record(engine, cost) {
      if (engine !== 'anthropic') return null;
      if (!Number.isFinite(cost)) {
        return 'Anthropic usage/cost is unavailable; refusing further calls because the spend ceiling cannot be enforced';
      }
      spentUsd += cost;
      if (spentUsd > maxCostUsd) {
        return `paid-run ceiling exceeded after in-flight call ($${spentUsd.toFixed(6)} > $${maxCostUsd.toFixed(6)})`;
      }
      return null;
    },
  };
}
