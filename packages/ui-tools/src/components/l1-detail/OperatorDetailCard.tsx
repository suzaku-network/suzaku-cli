'use client';

import { forwardRef } from 'react';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { OperatorWithNodes } from '@/hooks/useL1OperatorsWithNodes';
import { Gauge } from '@/components/ui/gauge';

function shortAddr(addr: Address) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface OperatorDetailCardProps {
  operator: OperatorWithNodes;
  isSelected: boolean;
  onSelect: (addr: Address) => void;
}

export const OperatorDetailCard = forwardRef<HTMLButtonElement, OperatorDetailCardProps>(
  ({ operator, isSelected, onSelect }, ref) => {
    const usedPct =
      operator.totalStake > 0n
        ? Number((operator.usedStake * 100n) / operator.totalStake)
        : 0;

    return (
      <button
        ref={ref}
        onClick={() => onSelect(operator.address)}
        className={[
          'w-full rounded-lg border p-3 text-left transition-colors',
          isSelected ? 'border-primary bg-primary/10' : 'border-border/50 bg-card hover:bg-card/80',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs">{shortAddr(operator.address)}</span>
          <span className="text-[10px] text-muted-foreground">{operator.nodeIds.length} nodes</span>
        </div>
        {isSelected && (
          <div className="mt-3 flex justify-around">
            <Gauge
              value={usedPct}
              label="Stake used"
              color="hsl(var(--primary))"
              size={56}
            />
            <div className="flex flex-col items-end justify-end gap-0.5 text-[10px] text-muted-foreground">
              <div>
                Used: <span className="font-mono text-foreground">{formatUnits(operator.usedStake, 18).slice(0, 8)}</span>
              </div>
              <div>
                Total: <span className="font-mono text-foreground">{formatUnits(operator.totalStake, 18).slice(0, 8)}</span>
              </div>
            </div>
          </div>
        )}
      </button>
    );
  },
);
OperatorDetailCard.displayName = 'OperatorDetailCard';
