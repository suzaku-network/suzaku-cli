'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { VaultDetail } from '@/hooks/useL1Vaults';
import type { StakerWithPositions } from '@/hooks/useVaultStakers';
function shortAddr(addr: Address) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface VaultCardProps {
  vault: VaultDetail;
  selectedStaker: Address | null;
  selectedOperator: Address | null;
  stakers: StakerWithPositions[];
  isSelected: boolean;
  onSelect: (addr: Address | null) => void;
}

export const VaultCard = forwardRef<HTMLButtonElement, VaultCardProps>(
  ({ vault, selectedStaker, stakers, isSelected, onSelect }, ref) => {
    const stakerPos = selectedStaker
      ? stakers.find((s) => s.address === selectedStaker)?.vaults[vault.address]
      : null;
    const isHighlightedByStaker = !!stakerPos;

    return (
      <motion.button
        ref={ref}
        layout
        onClick={() => onSelect(isSelected ? null : vault.address)}
        className={[
          'w-full rounded-lg border px-3 py-2 text-left transition-colors',
          isSelected
            ? 'border-primary bg-primary/10'
            : isHighlightedByStaker
              ? 'border-amber-500/50 bg-amber-500/5'
              : 'border-border/50 bg-card hover:bg-card/80',
        ].join(' ')}
        transition={{ layout: { duration: 0.2 } }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs">{shortAddr(vault.address)}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatUnits(vault.activeStake, 18).slice(0, 8)} staked
          </span>
        </div>
        {vault.collateral && (
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
            {shortAddr(vault.collateral)}
          </div>
        )}
        <AnimatePresence>
          {isHighlightedByStaker && stakerPos && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-1 overflow-hidden"
            >
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Staker share</span>
                <span className="font-semibold text-amber-400">{stakerPos.percentage.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Active shares</span>
                <span className="font-mono text-foreground">
                  {formatUnits(stakerPos.activeShares, 18).slice(0, 8)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    );
  },
);
VaultCard.displayName = 'VaultCard';
