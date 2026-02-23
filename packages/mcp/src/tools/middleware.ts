import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, CliResult } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, NodeID, Network, RpcUrl } from '../schemas.js';

/** Extract data from a CliResult, returning empty object on failure */
function extractData(result: CliResult): Record<string, unknown> {
  if (!result.success || result.data == null || typeof result.data !== 'object') return {};
  return result.data as Record<string, unknown>;
}

export function registerMiddlewareTools(server: McpServer) {
  // ── Reads ──

  server.tool(
    'middleware_get_all_operators',
    'List all registered operators from an L1Middleware contract',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-all-operators', middlewareAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_operator_stake',
    'Get stake for an operator at a specific epoch and collateral class',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address'),
      epoch: z.string().describe('Epoch number'),
      collateralClass: z.string().describe('Collateral class ID (bigint)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, operator, epoch, collateralClass, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-operator-stake', middlewareAddress, operator, epoch, collateralClass],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_active_nodes',
    'Get active validator nodes for an operator at a specific epoch',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address'),
      epoch: z.string().describe('Epoch number'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, operator, epoch, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-active-nodes-for-epoch', middlewareAddress, operator, epoch],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_current_epoch',
    'Get the current epoch number from the middleware',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-current-epoch', middlewareAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_operator_locked_stake',
    'Get locked (committed) stake for an operator',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, operator, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-operator-locked-stake', middlewareAddress, operator],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_operator_available_stake',
    'Get available (unused) stake for an operator',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, operator, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'get-operator-available-stake', middlewareAddress, operator],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'middleware_get_node_logs',
    'Get correlated on-chain events for a node from the middleware',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      nodeId: z.string().optional().describe('NodeID (CB58 format, e.g. NodeID-xxx) to filter logs for a specific node'),
      snowscanApiKey: z.string().optional().describe('Snowscan API key for fetching event logs'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, nodeId, snowscanApiKey, network, rpcUrl }) => {
      const args = ['middleware', 'node-logs', middlewareAddress];
      if (nodeId) args.push('--node-id', nodeId);
      const apiKey = snowscanApiKey || process.env.SNOWSCAN_API_KEY;
      if (apiKey) args.push('--snowscan-api-key', apiKey);
      return formatResult(await runCli(args, { network, rpcUrl }));
    },
  );

  server.tool(
    'middleware_account_info',
    'Get full account summary for an operator (stake, nodes, opt-ins)',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      account: Address.describe('Account/operator address to query'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, account, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['middleware', 'account-info', middlewareAddress, account],
        { network, rpcUrl },
      ));
    },
  );

  // ── Composite Reads (dashboard / report tools) ──

  server.tool(
    'middleware_operator_dashboard',
    'Complete dashboard for one operator: stake breakdown (available/used/locked, per collateral class), active nodes with per-node stake, optional rewards shares and uptime. Batches many reads into one call.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address'),
      epoch: z.string().optional().describe('Epoch number (defaults to current)'),
      rewardsAddress: Address.optional().describe('RewardsNativeToken address (enables rewards data)'),
      uptimeAddress: Address.optional().describe('UptimeTracker address (enables uptime data)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, operator, epoch, rewardsAddress, uptimeAddress, network, rpcUrl }) => {
      const opts = { network, rpcUrl };

      // Phase 1: independent reads in parallel
      const [epochResult, classIdsResult, usedResult, lockedResult, nodesResult] = await Promise.all([
        epoch ? Promise.resolve({ success: true, data: { epoch: Number(epoch) } } as CliResult) : runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-collateral-class-ids', middlewareAddress], opts),
        runCli(['middleware', 'get-operator-used-stake', middlewareAddress, operator], opts),
        runCli(['middleware', 'get-operator-locked-stake', middlewareAddress, operator], opts),
        runCli(['middleware', 'get-operator-nodes', middlewareAddress, operator], opts),
      ]);

      const currentEpoch = String(extractData(epochResult).epoch ?? epoch ?? 0);
      const classIds = (extractData(classIdsResult).collateralClassIds ?? []) as string[];
      const nodes = (extractData(nodesResult).nodes ?? []) as string[];

      // Phase 2: epoch-dependent reads in parallel
      const phase2Calls: Promise<CliResult>[] = [
        runCli(['middleware', 'get-active-nodes-for-epoch', middlewareAddress, operator, currentEpoch], opts),
        runCli(['middleware', 'get-operator-available-stake', middlewareAddress, operator], opts),
        ...classIds.map(classId =>
          runCli(['middleware', 'get-operator-stake', middlewareAddress, operator, currentEpoch, classId], opts)
        ),
      ];

      // Optional rewards
      if (rewardsAddress) {
        phase2Calls.push(
          runCli(['rewards', 'get-epoch-rewards', rewardsAddress, currentEpoch], opts),
          runCli(['rewards', 'get-operator-shares', rewardsAddress, currentEpoch, operator], opts),
        );
      }

      // Optional uptime
      if (uptimeAddress) {
        phase2Calls.push(
          runCli(['uptime', 'get-operator-uptime', uptimeAddress, operator, currentEpoch], opts),
          runCli(['uptime', 'check-operator-uptime-set', uptimeAddress, operator, currentEpoch], opts),
        );
      }

      const phase2Results = await Promise.all(phase2Calls);
      let idx = 0;
      const activeNodesData = extractData(phase2Results[idx++]);
      const availableData = extractData(phase2Results[idx++]);

      const byClass: Record<string, string> = {};
      for (const classId of classIds) {
        byClass[classId] = (extractData(phase2Results[idx++]).operatorStake as string) ?? 'unknown';
      }

      let rewards: Record<string, unknown> | undefined;
      if (rewardsAddress) {
        rewards = {
          epochRewards: extractData(phase2Results[idx++]).epochRewards,
          operatorShares: extractData(phase2Results[idx++]).operatorShares,
        };
      }

      let uptime: Record<string, unknown> | undefined;
      if (uptimeAddress) {
        uptime = {
          operatorUptime: extractData(phase2Results[idx++]).operatorUptime,
          isOperatorUptimeSet: extractData(phase2Results[idx++]).isOperatorUptimeSet,
        };
      }

      const dashboard = {
        operator,
        epoch: currentEpoch,
        stake: {
          available: availableData.availableStake ?? null,
          used: extractData(usedResult).usedStake ?? null,
          locked: extractData(lockedResult).lockedStake ?? null,
          byClass,
        },
        nodes: nodes,
        activeNodes: activeNodesData.nodeIds ?? [],
        ...(rewards ? { rewards } : {}),
        ...(uptime ? { uptime } : {}),
      };

      return formatResult({ success: true, data: dashboard });
    },
  );

  server.tool(
    'middleware_network_overview',
    'Network-level overview: epoch config, all operators with stake summaries, collateral classes, and optional vault listing. Aggregates many reads into one call.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      vaultManagerAddress: Address.optional().describe('VaultManager address (enables vault listing)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, vaultManagerAddress, network, rpcUrl }) => {
      const opts = { network, rpcUrl };

      // Phase 1: global state
      const [epochResult, operatorsResult, classIdsResult, activeClassesResult] = await Promise.all([
        runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-all-operators', middlewareAddress], opts),
        runCli(['middleware', 'get-collateral-class-ids', middlewareAddress], opts),
        runCli(['middleware', 'get-active-collateral-classes', middlewareAddress], opts),
      ]);

      const currentEpoch = String(extractData(epochResult).epoch ?? 0);
      const operators = (extractData(operatorsResult).operators ?? []) as string[];
      const classIds = (extractData(classIdsResult).collateralClassIds ?? []) as string[];
      const activeClasses = extractData(activeClassesResult).activeCollateralClasses;

      // Phase 2: per-operator metrics (parallel)
      const operatorCalls = operators.flatMap(op => [
        runCli(['middleware', 'get-operator-used-stake', middlewareAddress, op], opts),
        runCli(['middleware', 'get-operator-locked-stake', middlewareAddress, op], opts),
        runCli(['middleware', 'get-operator-nodes-length', middlewareAddress, op], opts),
        ...(classIds.length > 0
          ? [runCli(['middleware', 'get-operator-stake', middlewareAddress, op, currentEpoch, classIds[0]], opts)]
          : []),
      ]);

      // Optional vault data
      let vaultCountCall: Promise<CliResult> | undefined;
      if (vaultManagerAddress) {
        vaultCountCall = runCli(['vault-manager', 'get-vault-count', vaultManagerAddress], opts);
      }

      const [operatorResults, vaultCountResult] = await Promise.all([
        Promise.all(operatorCalls),
        vaultCountCall ?? Promise.resolve(undefined),
      ]);

      const fieldsPerOp = classIds.length > 0 ? 4 : 3;
      const operatorSummaries = operators.map((op, i) => {
        const base = i * fieldsPerOp;
        return {
          address: op,
          usedStake: extractData(operatorResults[base]).usedStake ?? null,
          lockedStake: extractData(operatorResults[base + 1]).lockedStake ?? null,
          nodesLength: extractData(operatorResults[base + 2]).nodesLength ?? null,
          ...(classIds.length > 0 ? { primaryClassStake: extractData(operatorResults[base + 3]).operatorStake ?? null } : {}),
        };
      });

      // Phase 3: vault listing (if vault manager provided and count > 0)
      let vaults: Record<string, unknown>[] | undefined;
      if (vaultCountResult) {
        const count = (extractData(vaultCountResult).vaultCount as number) ?? 0;
        if (count > 0) {
          const vaultCalls = Array.from({ length: count }, (_, i) =>
            runCli(['vault-manager', 'get-vault-at-with-times', vaultManagerAddress!, String(i)], opts)
          );
          const vaultResults = await Promise.all(vaultCalls);
          vaults = vaultResults.map(r => extractData(r).vault as Record<string, unknown> ?? {});
        }
      }

      const overview = {
        epoch: currentEpoch,
        collateralClasses: classIds,
        activeCollateralClasses: activeClasses,
        operators: operatorSummaries,
        totals: { operatorCount: operators.length, vaultCount: vaults?.length },
        ...(vaults ? { vaults } : {}),
      };

      return formatResult({ success: true, data: overview });
    },
  );

  server.tool(
    'middleware_epoch_rewards_report',
    'Rewards report for one or more epochs: total rewards, fee config, per-operator shares, optional uptime compliance. Aggregates many reads into one call.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      rewardsAddress: Address.describe('RewardsNativeToken contract address'),
      startEpoch: z.string().optional().describe('Start epoch for backwards iteration (defaults to current - 1)'),
      epochs: z.number().optional().describe('Number of epochs to report (default 1, max 10)'),
      uptimeAddress: Address.optional().describe('UptimeTracker address (enables uptime data)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, rewardsAddress, startEpoch: epoch, epochs: epochCount, uptimeAddress, network, rpcUrl }) => {
      const opts = { network, rpcUrl };
      const numEpochs = Math.min(epochCount ?? 1, 10);

      // Phase 1: global config
      const [epochResult, operatorsResult, feesResult, classIdsResult] = await Promise.all([
        runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-all-operators', middlewareAddress], opts),
        runCli(['rewards', 'get-fees-config', rewardsAddress], opts),
        runCli(['middleware', 'get-collateral-class-ids', middlewareAddress], opts),
      ]);

      const currentEpoch = Number(extractData(epochResult).epoch ?? 0);
      const operators = (extractData(operatorsResult).operators ?? []) as string[];
      const feesConfig = extractData(feesResult).feesConfig;
      const classIds = (extractData(classIdsResult).collateralClassIds ?? []) as string[];

      const startEpoch = epoch ? Number(epoch) : Math.max(currentEpoch - 1, 0);
      const epochRange = Array.from({ length: numEpochs }, (_, i) => startEpoch - i).filter(e => e >= 0);

      // Phase 2: per-class reward bips + min uptime
      const configCalls = [
        ...classIds.map(classId => runCli(['rewards', 'get-bips-collateral-class', rewardsAddress, classId], opts)),
        runCli(['rewards', 'get-min-uptime', rewardsAddress], opts),
      ];
      const configResults = await Promise.all(configCalls);

      const rewardsBipsByClass: Record<string, unknown> = {};
      classIds.forEach((classId, i) => {
        rewardsBipsByClass[classId] = extractData(configResults[i]).rewardsBips ?? null;
      });
      const minRequiredUptime = extractData(configResults[configResults.length - 1]).minRequiredUptime;

      // Phase 3: per-epoch data (rewards, distribution, operator shares, optional uptime)
      const epochReports = [];
      for (const ep of epochRange) {
        const epStr = String(ep);
        const epochCalls: Promise<CliResult>[] = [
          runCli(['rewards', 'get-epoch-rewards', rewardsAddress, epStr], opts),
          runCli(['rewards', 'get-distribution-batch', rewardsAddress, epStr], opts),
          ...operators.map(op => runCli(['rewards', 'get-operator-shares', rewardsAddress, epStr, op], opts)),
        ];
        if (uptimeAddress) {
          operators.forEach(op => {
            epochCalls.push(
              runCli(['uptime', 'get-operator-uptime', uptimeAddress, op, epStr], opts),
              runCli(['uptime', 'check-operator-uptime-set', uptimeAddress, op, epStr], opts),
            );
          });
        }

        const results = await Promise.all(epochCalls);
        let ridx = 0;
        const epochRewards = extractData(results[ridx++]).epochRewards;
        const distributionBatch = extractData(results[ridx++]).distributionBatch;

        const operatorData = operators.map(op => {
          const shares = extractData(results[ridx++]).operatorShares;
          return { address: op, shares };
        });

        if (uptimeAddress) {
          operatorData.forEach(od => {
            (od as Record<string, unknown>).uptime = extractData(results[ridx++]).operatorUptime;
            (od as Record<string, unknown>).uptimeSet = extractData(results[ridx++]).isOperatorUptimeSet;
          });
        }

        epochReports.push({
          epoch: ep,
          totalRewards: epochRewards,
          distribution: distributionBatch,
          operators: operatorData,
        });
      }

      const report = {
        feeConfig: feesConfig,
        minRequiredUptime,
        rewardsBipsByClass,
        epochs: epochReports,
      };

      return formatResult({ success: true, data: report });
    },
  );

  server.tool(
    'middleware_stake_matrix',
    'Operator-by-collateral-class stake matrix: stake for every (operator, class) pair, plus available/used/locked per operator. Ideal for heatmaps and stacked bar charts.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      epoch: z.string().optional().describe('Epoch number (defaults to current)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, epoch, network, rpcUrl }) => {
      const opts = { network, rpcUrl };

      // Phase 1: dimensions
      const [epochResult, operatorsResult, classIdsResult] = await Promise.all([
        epoch ? Promise.resolve({ success: true, data: { epoch: Number(epoch) } } as CliResult) : runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-all-operators', middlewareAddress], opts),
        runCli(['middleware', 'get-collateral-class-ids', middlewareAddress], opts),
      ]);

      const currentEpoch = String(extractData(epochResult).epoch ?? epoch ?? 0);
      const operators = (extractData(operatorsResult).operators ?? []) as string[];
      const classIds = (extractData(classIdsResult).collateralClassIds ?? []) as string[];

      // Phase 2: operator x class matrix + per-operator totals (all parallel)
      const matrixCalls = operators.flatMap(op => [
        runCli(['middleware', 'get-operator-used-stake', middlewareAddress, op], opts),
        runCli(['middleware', 'get-operator-locked-stake', middlewareAddress, op], opts),
        ...classIds.map(classId =>
          runCli(['middleware', 'get-operator-stake', middlewareAddress, op, currentEpoch, classId], opts)
        ),
      ]);

      const matrixResults = await Promise.all(matrixCalls);

      const fieldsPerOp = 2 + classIds.length;
      const matrix: Record<string, Record<string, unknown>> = {};
      operators.forEach((op, i) => {
        const base = i * fieldsPerOp;
        const byClass: Record<string, string> = {};
        classIds.forEach((classId, ci) => {
          byClass[classId] = (extractData(matrixResults[base + 2 + ci]).operatorStake as string) ?? 'unknown';
        });
        matrix[op] = {
          usedStake: extractData(matrixResults[base]).usedStake ?? null,
          lockedStake: extractData(matrixResults[base + 1]).lockedStake ?? null,
          byClass,
        };
      });

      const result = {
        epoch: currentEpoch,
        operators,
        collateralClasses: classIds,
        matrix,
      };

      return formatResult({ success: true, data: result });
    },
  );

  server.tool(
    'middleware_uptime_report',
    'Uptime report across epochs for all operators: per-operator uptime seconds, uptime-set flags, per-validator drill-down. Ideal for time-series charts with threshold lines.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      uptimeAddress: Address.describe('UptimeTracker contract address'),
      epochs: z.number().optional().describe('Number of epochs to report (default 5, max 10)'),
      startEpoch: z.string().optional().describe('Start epoch (defaults to current)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ middlewareAddress, uptimeAddress, epochs: epochCount, startEpoch, network, rpcUrl }) => {
      const opts = { network, rpcUrl };
      const numEpochs = Math.min(epochCount ?? 5, 10);

      // Phase 1: epoch + operators
      const [epochResult, operatorsResult] = await Promise.all([
        runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-all-operators', middlewareAddress], opts),
      ]);

      const currentEpoch = Number(extractData(epochResult).epoch ?? 0);
      const operators = (extractData(operatorsResult).operators ?? []) as string[];

      const start = startEpoch ? Number(startEpoch) : currentEpoch;
      const epochRange = Array.from({ length: numEpochs }, (_, i) => start - i).filter(e => e >= 0);

      // Phase 2: per-operator nodes
      const nodesCalls = operators.map(op =>
        runCli(['middleware', 'get-operator-nodes', middlewareAddress, op], opts)
      );
      const nodesResults = await Promise.all(nodesCalls);

      // Phase 3: per-operator per-epoch uptime (parallel)
      const uptimeCalls: Promise<CliResult>[] = [];
      for (const ep of epochRange) {
        const epStr = String(ep);
        for (const op of operators) {
          uptimeCalls.push(
            runCli(['uptime', 'get-operator-uptime', uptimeAddress, op, epStr], opts),
            runCli(['uptime', 'check-operator-uptime-set', uptimeAddress, op, epStr], opts),
          );
        }
      }
      const uptimeResults = await Promise.all(uptimeCalls);

      // Assemble per-operator data
      const operatorData = operators.map((op, oi) => {
        const nodes = (extractData(nodesResults[oi]).nodes ?? []) as string[];
        const uptimeByEpoch = epochRange.map((ep, ei) => {
          const base = (ei * operators.length + oi) * 2;
          return {
            epoch: ep,
            operatorUptime: extractData(uptimeResults[base]).operatorUptime ?? null,
            isUptimeSet: extractData(uptimeResults[base + 1]).isOperatorUptimeSet ?? null,
          };
        });

        const epochsWithUptimeSet = uptimeByEpoch.filter(e => e.isUptimeSet === true).length;

        return {
          address: op,
          validators: nodes,
          uptimeByEpoch,
          summary: {
            epochsWithUptimeSet,
            totalEpochs: epochRange.length,
          },
        };
      });

      const report = {
        epochRange,
        currentEpoch,
        operators: operatorData,
      };

      return formatResult({ success: true, data: report });
    },
  );

  // ── Writes ──

  server.tool(
    'middleware_register_operator',
    'Register an operator in the L1Middleware (requires SUZAKU_PK)',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      operator: Address.describe('Operator address to register'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ middlewareAddress, operator, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('middleware_register_operator', { middlewareAddress, operator, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['middleware', 'register-operator', middlewareAddress, operator],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'middleware_add_node',
    'Add a validator node to the middleware (requires SUZAKU_PK)',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      nodeId: NodeID,
      blsKey: z.string().describe('BLS public key (hex)'),
      initialStake: z.string().optional().describe('Initial stake amount (default: 0)'),
      registrationExpiry: z.string().optional().describe('Registration expiry timestamp'),
      pchainRemainingBalanceOwnerThreshold: z.number().optional().describe('P-Chain remaining balance owner threshold (default: 1)'),
      pchainDisableOwnerThreshold: z.number().optional().describe('P-Chain disable owner threshold (default: 1)'),
      pchainRemainingBalanceOwnerAddresses: z.array(z.string()).optional().describe('P-Chain remaining balance owner addresses (hex)'),
      pchainDisableOwnerAddresses: z.array(z.string()).optional().describe('P-Chain disable owner addresses (hex)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ middlewareAddress, nodeId, blsKey, initialStake, registrationExpiry, pchainRemainingBalanceOwnerThreshold, pchainDisableOwnerThreshold, pchainRemainingBalanceOwnerAddresses, pchainDisableOwnerAddresses, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('middleware_add_node', { middlewareAddress, nodeId, blsKey, initialStake, registrationExpiry, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['middleware', 'add-node', middlewareAddress, nodeId, blsKey];
      if (initialStake) args.push('--initial-stake', initialStake);
      if (registrationExpiry) args.push('--registration-expiry', registrationExpiry);
      if (pchainRemainingBalanceOwnerThreshold !== undefined) args.push('--pchain-remaining-balance-owner-threshold', String(pchainRemainingBalanceOwnerThreshold));
      if (pchainDisableOwnerThreshold !== undefined) args.push('--pchain-disable-owner-threshold', String(pchainDisableOwnerThreshold));
      for (const addr of pchainRemainingBalanceOwnerAddresses ?? []) args.push('--pchain-remaining-balance-owner-address', addr);
      for (const addr of pchainDisableOwnerAddresses ?? []) args.push('--pchain-disable-owner-address', addr);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'middleware_init_stake_update',
    'Initialize a stake weight change for a validator node (requires SUZAKU_PK)',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      nodeId: NodeID,
      newStake: z.string().describe('New stake weight amount'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ middlewareAddress, nodeId, newStake, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('middleware_init_stake_update', { middlewareAddress, nodeId, newStake, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['middleware', 'init-stake-update', middlewareAddress, nodeId, newStake],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  // ── Operations ──

  server.tool(
    'middleware_weight_watcher',
    'Run the weight watcher orchestrator — long-running operation that processes pending stake updates across epochs, may run for several minutes (requires SUZAKU_PK)',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      epochs: z.number().optional().describe('Number of epochs to process'),
      loopEpochs: z.number().optional().describe('Number of loop epochs'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ middlewareAddress, epochs, loopEpochs, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('middleware_weight_watcher', { middlewareAddress, epochs, loopEpochs, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['middleware', 'weight-watcher', middlewareAddress];
      if (epochs !== undefined) args.push('-e', String(epochs));
      if (loopEpochs !== undefined) args.push('-l', String(loopEpochs));
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, timeout: 300_000 }));
    },
  );
}

