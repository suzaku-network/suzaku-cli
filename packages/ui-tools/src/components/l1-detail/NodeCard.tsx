'use client';

import type { Hex } from 'viem';
import { Gauge } from '@/components/ui/gauge';

function shortHex(hex: Hex) {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

interface NodeCardProps {
  nodeId: Hex;
  operatorUsedStake: bigint;
  operatorTotalStake: bigint;
  nodeIndex: number;
}

export function NodeCard({ nodeId, operatorUsedStake, operatorTotalStake, nodeIndex }: NodeCardProps) {
  const stakePct =
    operatorTotalStake > 0n
      ? Number((operatorUsedStake * 100n) / operatorTotalStake) / Math.max(nodeIndex + 1, 1)
      : 0;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <p className="mb-3 font-mono text-[10px] text-muted-foreground">{shortHex(nodeId)}</p>
      <div className="flex justify-around gap-2">
        <Gauge
          value={Math.min(stakePct, 100)}
          label="Stake %"
          color="hsl(var(--primary))"
          size={52}
        />
        <Gauge
          value={0}
          label="Uptime"
          color="hsl(142 72% 50%)"
          size={52}
        />
        <Gauge
          value={0}
          label="Rewards"
          color="hsl(38 92% 50%)"
          size={52}
        />
      </div>
    </div>
  );
}
